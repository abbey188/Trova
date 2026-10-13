// Measured exit, stored and read back. Server-only (Supabase service key).
//
// The score needs a measurement that is comparable day to day, so it reads the latest one taken
// while the US market was OPEN: a token that only trades in market hours would otherwise flip to
// "untradable" every evening and weekend. The latest measurement of any session is kept beside it,
// because "does it trade while the market is shut" is a fact worth showing in its own right.
//
// Degrades like every other source: no table, no key or no rows means no measurement, and the score
// falls back to pool depth — it never fails a page.

import { selectRows, upsertRows } from "./supabase-rest";
import type { ExitQuote, MeasuredExit } from "./types";

/** A measurement older than this no longer describes the market; the score falls back to pools. */
export const MEASUREMENT_MAX_AGE_DAYS = 4; // spans a weekend plus a Monday holiday

export interface ExitMeasurementRow {
  mint: string;
  symbol: string | null;
  snapshot_date: string;
  taken_at: string;
  session: "open" | "closed";
  size_usd: number;
  status: ExitQuote["status"];
  round_trip_pct: number | null;
  liquidity: "pools" | "market-maker" | null;
  pools_round_trip_pct: number | null;
  route_labels: string[];
}

export interface StoredExit {
  /** Latest in-hours measurement — the one the score reads. */
  scored: MeasuredExit | null;
  /** Latest measurement taken while the US market was shut. */
  closed: MeasuredExit | null;
}

/**
 * The measurement to score from: the latest one taken in market hours, or — when there is none —
 * the latest one taken out of hours. `measuredFacts` then decides whether it can be scored at all.
 */
export function forScore(stored?: StoredExit | null): MeasuredExit | null {
  return stored?.scored ?? stored?.closed ?? null;
}

/** US regular hours, 9:30–16:00 New York time, Monday to Friday. Holidays are not known here. */
export function usSession(now = new Date()): "open" | "closed" {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const weekday = !["Sat", "Sun"].includes(get("weekday"));
  return weekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60 ? "open" : "closed";
}

function group(rows: ExitMeasurementRow[]): MeasuredExit {
  return {
    takenAt: rows.reduce((latest, r) => (r.taken_at > latest ? r.taken_at : latest), rows[0].taken_at),
    session: rows[0].session,
    rungs: rows
      .map((r) => ({
        status: r.status,
        roundTripPct: r.round_trip_pct == null ? null : Number(r.round_trip_pct),
        routable: r.status === "ok",
        usdSize: r.size_usd,
        routeLabels: r.route_labels ?? [],
        liquidity: r.liquidity,
        poolsRoundTripPct: r.pools_round_trip_pct == null ? null : Number(r.pools_round_trip_pct),
      }))
      .sort((a, b) => a.usdSize - b.usdSize),
  };
}

const sinceDate = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Rows → the newest day's ladder per mint, for each session. */
function latestPerMint(rows: ExitMeasurementRow[]): Map<string, StoredExit> {
  const byKey = new Map<string, ExitMeasurementRow[]>();
  for (const r of rows) {
    const key = `${r.mint}|${r.session}|${r.snapshot_date}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
  }
  const out = new Map<string, StoredExit>();
  // Oldest first, so a newer day simply replaces an older one.
  for (const key of [...byKey.keys()].sort((a, b) => a.split("|")[2].localeCompare(b.split("|")[2]))) {
    const [mint, session] = key.split("|");
    const entry = out.get(mint) ?? out.set(mint, { scored: null, closed: null }).get(mint)!;
    const measured = group(byKey.get(key)!);
    if (session === "open") entry.scored = measured;
    else entry.closed = measured;
  }
  return out;
}

/**
 * The latest stored measurement for each mint (or for every mint when none are named). Never throws.
 */
export async function latestMeasurements(mints?: string[]): Promise<Map<string, StoredExit>> {
  if (mints && mints.length === 0) return new Map();
  try {
    const filter = mints ? `&mint=in.(${[...new Set(mints)].join(",")})` : "";
    const rows = await selectRows<ExitMeasurementRow>(
      "exit_measurements",
      `select=mint,symbol,snapshot_date,taken_at,session,size_usd,status,round_trip_pct,liquidity,pools_round_trip_pct,route_labels&snapshot_date=gte.${sinceDate(MEASUREMENT_MAX_AGE_DAYS)}${filter}&order=id`,
    );
    return latestPerMint(rows);
  } catch {
    return new Map();
  }
}

/** The measurements taken on one date — what a re-score of that day's snapshot should read. */
export async function measurementsOn(date: string): Promise<Map<string, StoredExit>> {
  try {
    const rows = await selectRows<ExitMeasurementRow>(
      "exit_measurements",
      `select=mint,symbol,snapshot_date,taken_at,session,size_usd,status,round_trip_pct,liquidity,pools_round_trip_pct,route_labels&snapshot_date=eq.${date}&order=id`,
    );
    return latestPerMint(rows);
  } catch {
    return new Map();
  }
}

/** Mints that already have an in-session measurement for this date and session — a job's resume point. */
export async function measuredMints(date: string, session: "open" | "closed"): Promise<Set<string>> {
  const rows = await selectRows<{ mint: string }>("exit_measurements", `select=mint&snapshot_date=eq.${date}&session=eq.${session}&order=id`);
  return new Set(rows.map((r) => r.mint));
}

export interface CoverageDay {
  date: string;
  session: "open" | "closed";
  /** Tokens with a stored $5,000 rung that day and session — every measured token has one. */
  tokens: number;
  quoted: number;
  noRoute: number;
  marketClosed: number;
  firstAt: string;
  lastAt: string;
}

interface RuleRung { mint: string; snapshot_date: string; session: "open" | "closed"; status: ExitQuote["status"]; taken_at: string }

/** The $5,000 rung of every stored ladder in the window — one row per token, day and session. */
async function ruleRungs(days: number): Promise<RuleRung[]> {
  return selectRows<RuleRung>("exit_measurements", `select=mint,snapshot_date,session,status,taken_at&size_usd=eq.5000&snapshot_date=gte.${sinceDate(days)}&order=id`);
}

/**
 * How much of the token list was measured, per day and market session, newest first. The record is
 * only worth something unbroken, so its gaps are published rather than left to be discovered.
 */
export async function coverage(days = 30): Promise<CoverageDay[]> {
  const byKey = new Map<string, CoverageDay>();
  for (const r of await ruleRungs(days)) {
    const key = `${r.snapshot_date}|${r.session}`;
    const d = byKey.get(key) ?? byKey.set(key, { date: r.snapshot_date, session: r.session, tokens: 0, quoted: 0, noRoute: 0, marketClosed: 0, firstAt: r.taken_at, lastAt: r.taken_at }).get(key)!;
    d.tokens++;
    if (r.status === "ok") d.quoted++;
    else if (r.status === "no-route") d.noRoute++;
    else if (r.status === "market-closed") d.marketClosed++;
    if (r.taken_at < d.firstAt) d.firstAt = r.taken_at;
    if (r.taken_at > d.lastAt) d.lastAt = r.taken_at;
  }
  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.session.localeCompare(b.session));
}

/** When each mint was last measured in a session, within the last `days`. Absent = not in that window. */
export async function lastMeasured(session: "open" | "closed", days = 10): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of await ruleRungs(days)) {
    if (r.session === session && (out.get(r.mint) ?? "") < r.taken_at) out.set(r.mint, r.taken_at);
  }
  return out;
}

export interface ContrastPair { assetId: string; goodMint: string; thinMint: string }

/**
 * One company with two tokens the measurements tell apart: one that left $5,000 for under 1%, and
 * one that — in market hours, so the hour is not the reason — lost half of it or found no route.
 * The landing page shows such a pair; it is chosen from data so the example can never go stale the
 * way a hard-coded one did. The most widely held sound token wins. Null when nothing qualifies.
 */
export async function pickContrastPair(): Promise<ContrastPair | null> {
  try {
    const [latest] = await selectRows<{ snapshot_date: string }>("variant_snapshots", "select=snapshot_date&order=snapshot_date.desc&limit=1");
    if (!latest) return null;
    const [variants, measured] = await Promise.all([
      selectRows<{ mint: string; asset_id: string; holders: number | null; advisory_status: string | null }>(
        "variant_snapshots", `select=mint,asset_id,holders,advisory_status&snapshot_date=eq.${latest.snapshot_date}&order=id`),
      latestMeasurements(),
    ]);
    const byAsset = new Map<string, typeof variants>();
    for (const v of variants) (byAsset.get(v.asset_id) ?? byAsset.set(v.asset_id, []).get(v.asset_id)!).push(v);

    let best: (ContrastPair & { holders: number }) | null = null;
    for (const [assetId, list] of byAsset) {
      const rule = (mint: string) => measured.get(mint)?.scored?.rungs.find((r) => r.usdSize === 5_000);
      const good = list
        .filter((v) => !v.advisory_status && rule(v.mint)?.status === "ok" && (rule(v.mint)!.roundTripPct ?? 100) < 1)
        .sort((a, b) => (b.holders ?? 0) - (a.holders ?? 0))[0];
      const thin = list.find((v) => {
        const r = rule(v.mint);
        return v.mint !== good?.mint && !v.advisory_status && r != null && (r.status === "no-route" || (r.status === "ok" && (r.roundTripPct ?? 0) >= 50));
      });
      if (good && thin && (good.holders ?? 0) > (best?.holders ?? -1)) best = { assetId, goodMint: good.mint, thinMint: thin.mint, holders: good.holders ?? 0 };
    }
    return best ? { assetId: best.assetId, goodMint: best.goodMint, thinMint: best.thinMint } : null;
  } catch {
    return null;
  }
}

export async function writeMeasurements(rows: ExitMeasurementRow[]): Promise<number> {
  return rows.length ? upsertRows("exit_measurements", rows, "mint,snapshot_date,session,size_usd") : 0;
}
