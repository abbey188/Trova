// Daily variant snapshots across the curated universe (stocks, ETFs, metals, RWAs).
// Server-only. Degrades per source: a failed list or asset is recorded, not fatal, and
// Backpack context is optional. Used by scripts/snapshot.ts and the /api/cron/snapshot route.

import { pool } from "./async";
import { getBackpackIssuedMints, getSecurities } from "./backpack";
import { forScore, latestMeasurements, recentForScore } from "./exit-store";
import { insertRow, selectRows, upsertRows } from "./supabase-rest";
import { getMintFacts } from "./token-extensions";
import { getVariants, resolveIssuer } from "./tokens-xyz";
import { METHOD_VERSION, scoreVariant, type ScoreContext } from "./trust-score";
import type { TrovaScore, TxzVariant } from "./types";
import { getCuratedUniverse } from "./universe";

export interface SnapshotRow {
  snapshot_date: string;
  method_version: string;
  asset_id: string;
  asset_class: string;
  mint: string;
  symbol: string;
  issuer: string;
  issuer_confirmed: boolean;
  instrument_class: string;
  speculative: boolean;
  score: number | null;
  grade: string;
  borderline: boolean;
  structure: number;
  market: number;
  confidence: string;
  routable: boolean;
  not_routable_reason: string | null;
  tier: string;
  stock_variant_tier: string | null;
  advisory_status: string | null;
  advisory_reason: string | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  trades_24h: number | null;
  holders: number | null;
  execution_score: number | null;
  bot_volume_ratio: number | null;
  flags: string[];
  /** The issuer's on-chain controls as read from the mint that day (lib/token-extensions.ts). */
  controls?: unknown;
  raw: unknown;
}

export interface SnapshotResult {
  date: string;
  assets: number;
  rows: SnapshotRow[];
  errors: { scope: string; error: string }[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function toRow(v: TxzVariant, s: TrovaScore, meta: { date: string; assetId: string; assetClass: string }): SnapshotRow {
  const m = v.market;
  return {
    snapshot_date: meta.date,
    method_version: s.methodVersion,
    asset_id: meta.assetId,
    asset_class: meta.assetClass,
    mint: v.mint,
    symbol: v.symbol,
    issuer: resolveIssuer(v),
    issuer_confirmed: s.issuerConfirmed,
    instrument_class: s.instrument.class,
    speculative: s.instrument.speculative,
    score: s.score,
    grade: s.grade,
    borderline: s.borderline != null,
    structure: s.ownership.score,
    market: s.exit.score,
    confidence: s.confidence,
    routable: s.routable,
    not_routable_reason: s.notRoutableReason ?? null,
    tier: s.tier,
    stock_variant_tier: v.stockVariantTier ?? null,
    advisory_status: v.advisory?.status ?? null,
    advisory_reason: v.advisory?.reason ?? null,
    liquidity_usd: m.liquidity ?? null,
    volume_24h_usd: m.volume24hUSD ?? null,
    trades_24h: m.trade24h ?? null,
    holders: m.holder ?? null,
    execution_score: v.executionQuality?.executionScore ?? null,
    bot_volume_ratio: v.executionQuality?.botVolumeRatio ?? null,
    flags: s.flags.filter((f) => f !== "short-history"), // depends on history at read time, not the snapshot
    raw: v,
  };
}

export async function collectSnapshots(opts: { date?: string; concurrency?: number } = {}): Promise<SnapshotResult> {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const errors: SnapshotResult["errors"] = [];

  const [securities, backpackMints, assets, measured] = await Promise.all([
    getSecurities().catch((e) => { errors.push({ scope: "backpack:securities", error: message(e) }); return null; }),
    getBackpackIssuedMints().catch((e) => { errors.push({ scope: "backpack:assets", error: message(e) }); return null; }),
    getCuratedUniverse(errors),
    latestMeasurements(),
  ]);

  const rows = new Map<string, SnapshotRow>();
  await pool([...assets.values()], opts.concurrency ?? 4, async ({ asset, assetClass }) => {
    try {
      for (const v of await getVariants(asset.assetId)) {
        if (rows.has(v.mint)) continue;
        const s = scoreVariant(v, {
          assetId: asset.assetId,
          canonicalSource: asset.canonicalMarket?.source,
          issuerConfirmed: backpackMints?.has(v.mint),
          measuredExit: forScore(measured.get(v.mint)),
          recentExits: recentForScore(measured.get(v.mint)),
        });
        rows.set(v.mint, toRow(v, s, { date, assetId: asset.assetId, assetClass }));
      }
    } catch (e) {
      errors.push({ scope: `variants:${asset.assetId}`, error: message(e) });
    }
  });

  // What each issuer can do to its token on-chain, read from the mints in a handful of calls. Stored so
  // a change — a pause switched on, a fee raised, a hook program attached — shows up as a difference
  // between two days. Optional: a failed read leaves the column empty for those tokens.
  const facts = await getMintFacts([...rows.keys()]).catch(() => null);
  if (facts) for (const row of rows.values()) row.controls = facts.get(row.mint)?.controls ?? null;

  return { date, assets: assets.size, rows: [...rows.values()], errors };
}

export interface SnapshotRunSummary {
  date: string;
  methodVersion: string;
  assets: number;
  variants: number;
  written: number;
  dryRun: boolean;
  seconds: number;
  grades: Record<string, number>;
  routableGrades: Record<string, number>;
  instrumentClasses: Record<string, number>;
  borderline: number;
  speculative: number;
  errors: SnapshotResult["errors"];
}

function tally<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
}

/** Collect, score and (unless dryRun) store today's snapshot plus a run record. */
export async function runSnapshot(opts: { dryRun?: boolean } = {}): Promise<SnapshotRunSummary> {
  const startedAt = new Date();
  const { date, assets, rows, errors } = await collectSnapshots();

  let written = 0;
  if (!opts.dryRun) {
    try {
      written = await upsertRows("variant_snapshots", rows, "mint,snapshot_date");
    } catch (e) {
      // The `controls` column arrives with migration 20261012000000. Until it is applied the snapshot
      // must still be written — a day without ratings is worse than a day without controls.
      if (!/controls/.test(message(e))) throw e;
      errors.push({ scope: "snapshot:controls", error: "controls column missing — apply migration 20261012000000" });
      written = await upsertRows("variant_snapshots", rows.map(({ controls: _dropped, ...rest }) => rest), "mint,snapshot_date");
    }
    await insertRow("snapshot_runs", {
      started_at: startedAt.toISOString(),
      snapshot_date: date,
      method_version: METHOD_VERSION,
      assets,
      variants: written,
      errors,
    });
  }

  return {
    date,
    methodVersion: METHOD_VERSION,
    assets,
    variants: rows.length,
    written,
    dryRun: Boolean(opts.dryRun),
    seconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    grades: tally(rows, (r) => r.grade),
    routableGrades: tally(rows, (r) => (r.routable ? r.grade : "not routable")),
    instrumentClasses: tally(rows, (r) => r.instrument_class),
    borderline: rows.filter((r) => r.borderline).length,
    speculative: rows.filter((r) => r.speculative).length,
    errors,
  };
}

interface StoredRow {
  mint: string;
  symbol: string;
  asset_id: string;
  asset_class: string;
  issuer_confirmed: boolean;
  flags: string[];
  score: number | null;
  grade: string;
  method_version: string;
  raw: TxzVariant;
}

/**
 * Re-score a stored snapshot date under the current METHOD_VERSION, from its raw inputs.
 * Market data is not re-fetched, so history stays what was observed that day.
 */
export async function rescoreSnapshots(date: string) {
  const errors: SnapshotResult["errors"] = [];
  // What had been measured by that day, within the same window the live score uses.
  const [measured, stored, securities, assets] = await Promise.all([
    latestMeasurements(undefined, date),
    selectRows<StoredRow>(
      "variant_snapshots",
      `select=mint,symbol,asset_id,asset_class,issuer_confirmed,flags,score,grade,method_version,raw&snapshot_date=eq.${date}&order=id`,
    ),
    getSecurities().catch((e) => { errors.push({ scope: "backpack:securities", error: message(e) }); return null; }),
    getCuratedUniverse(errors),
  ]);

  const changes: { symbol: string; from: string; to: string }[] = [];
  const rows = stored.map((r) => {
    const asset = assets.get(r.asset_id)?.asset;
    const ctx: ScoreContext = {
      assetId: r.asset_id,
      canonicalSource: asset?.canonicalMarket?.source,
      issuerConfirmed: r.issuer_confirmed,
      measuredExit: forScore(measured.get(r.mint)),
      recentExits: recentForScore(measured.get(r.mint)),
    };
    const s = scoreVariant(r.raw, ctx);
    const from = `${r.grade}(${r.score ?? "–"})`, to = `${s.grade}(${s.score ?? "–"})`;
    if (from !== to) changes.push({ symbol: r.symbol, from, to });
    return toRow(r.raw, s, { date, assetId: r.asset_id, assetClass: r.asset_class });
  });

  const written = rows.length ? await upsertRows("variant_snapshots", rows, "mint,snapshot_date") : 0;
  return { date, methodVersion: METHOD_VERSION, rescored: written, changes, errors };
}
