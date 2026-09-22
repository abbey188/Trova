// "What changed" signals from daily snapshots, for long-term holders. Factual only, never predictive.
// Structural changes (advisory, redemption, instrument class, tier) fire on the snapshot they appear.
// Noisy changes (grade, tradability, exit score) must hold for PERSISTENCE consecutive snapshots,
// so borderline flicker never alerts. Grade changes caused by a method-version change are ignored.

import { selectRows } from "./supabase-rest";
import { INSTRUMENT_INFO } from "./trust-score";
import type { InstrumentClass, Signal } from "./types";

export const PERSISTENCE = 3;
export const MARKET_BASELINE_SNAPSHOTS = 7;
export const MARKET_CHANGE_POINTS = 15;
export const MAX_SIGNAL_DAYS = 90;

export interface SnapshotPoint {
  snapshot_date: string;
  mint: string;
  asset_id: string;
  symbol: string;
  method_version: string;
  score: number | null;
  grade: string;
  exit: number;
  tier: string | null;
  stock_variant_tier: string | null;
  advisory_status: string | null;
  advisory_reason: string | null;
  instrument_class: string;
  routable: boolean;
  not_routable_reason: string | null;
}

const COLUMNS = [
  "snapshot_date", "mint", "asset_id", "symbol", "method_version", "score", "grade", "exit:market", "tier",
  "stock_variant_tier", "advisory_status", "advisory_reason", "instrument_class", "routable", "not_routable_reason",
].join(",");

const REDEMPTION_RANK: Record<string, number> = { share_redeemable: 3, cash_redeemable: 2, not_redeemable: 1 };
const REDEMPTION_WORDS: Record<string, string> = {
  share_redeemable: "share-redeemable",
  cash_redeemable: "cash-redeemable",
  not_redeemable: "not redeemable",
};
const GRADE_RANK: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
const SEVERITY_RANK: Record<Signal["severity"], number> = { danger: 3, warn: 2, info: 1 };

const redemptionWord = (t: string | null) => (t ? REDEMPTION_WORDS[t] ?? t : "not reported");
const tierWord = (t: string | null) => (t ? `Tier ${t.replace("tier", "")}` : "no tier");
const classLabel = (c: string) => INSTRUMENT_INFO[c as InstrumentClass]?.label ?? c;
const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A change in `key` confirmed at index i: the last PERSISTENCE snapshots agree and differ from the one before. */
function confirmedChange<K extends "grade" | "routable">(h: SnapshotPoint[], i: number, key: K) {
  if (i < PERSISTENCE) return null;
  const before = h[i - PERSISTENCE];
  const to = h[i][key];
  if (before[key] === to) return null;
  const run = h.slice(i - PERSISTENCE + 1, i + 1);
  if (!run.every((p) => p[key] === to && p.method_version === before.method_version)) return null;
  return { from: before[key], to };
}

/** Market health moved ≥ MARKET_CHANGE_POINTS from its baseline median and held for PERSISTENCE snapshots. */
function exitShift(h: SnapshotPoint[], i: number) {
  const start = i - PERSISTENCE - MARKET_BASELINE_SNAPSHOTS + 1;
  if (start < 0) return null;
  const baseline = median(h.slice(start, i - PERSISTENCE + 1).map((p) => p.exit));
  const run = h.slice(i - PERSISTENCE + 1, i + 1);
  const justBefore = h[i - PERSISTENCE];
  for (const dir of [-1, 1] as const) {
    const beyond = (m: number) => (dir < 0 ? m <= baseline - MARKET_CHANGE_POINTS : m >= baseline + MARKET_CHANGE_POINTS);
    if (run.every((p) => beyond(p.exit)) && !beyond(justBefore.exit)) {
      return { baseline: Math.round(baseline), to: h[i].exit, dir };
    }
  }
  return null;
}

/** Detect change events in ONE variant's history (sorted ascending by snapshot_date). */
export function detectSignals(history: SnapshotPoint[]): Signal[] {
  const out: Signal[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    const base = { assetId: cur.asset_id, mint: cur.mint, symbol: cur.symbol, detectedAt: dayStart(cur.snapshot_date) };

    if (cur.advisory_status !== prev.advisory_status) {
      if (cur.advisory_status) {
        out.push({
          ...base, kind: "advisory",
          severity: cur.advisory_status === "caution" ? "warn" : "danger",
          message: `tokens.xyz advisory on ${cur.symbol}: ${cur.advisory_status}${cur.advisory_reason ? ` — ${cur.advisory_reason}` : ""}`,
          from: prev.advisory_status ?? "none", to: cur.advisory_status,
        });
      } else {
        out.push({ ...base, kind: "advisory", severity: "info", message: `The tokens.xyz advisory on ${cur.symbol} was cleared (was ${prev.advisory_status}).`, from: prev.advisory_status ?? "none", to: "none" });
      }
    }

    if (cur.stock_variant_tier !== prev.stock_variant_tier) {
      const worse = (REDEMPTION_RANK[cur.stock_variant_tier ?? ""] ?? 0) < (REDEMPTION_RANK[prev.stock_variant_tier ?? ""] ?? 0);
      out.push({
        ...base, kind: "redemption-change", severity: worse ? "warn" : "info",
        message: `${cur.symbol} redemption changed: ${redemptionWord(prev.stock_variant_tier)} → ${redemptionWord(cur.stock_variant_tier)}.`,
        from: redemptionWord(prev.stock_variant_tier), to: redemptionWord(cur.stock_variant_tier),
      });
    }

    if (cur.instrument_class !== prev.instrument_class) {
      out.push({
        ...base, kind: "ownership-change", severity: cur.instrument_class === "pre-ipo-exposure" ? "warn" : "info",
        message: `${cur.symbol} is now classified as "${classLabel(cur.instrument_class)}" (was "${classLabel(prev.instrument_class)}").`,
        from: prev.instrument_class, to: cur.instrument_class,
      });
    }

    if (cur.tier !== prev.tier) {
      out.push({
        ...base, kind: "tier-change", severity: "info",
        message: `${cur.symbol} liquidity tier changed: ${tierWord(prev.tier)} → ${tierWord(cur.tier)}.`,
        from: tierWord(prev.tier), to: tierWord(cur.tier),
      });
    }

    const grade = confirmedChange(history, i, "grade");
    if (grade) {
      const down = (GRADE_RANK[grade.to] ?? 0) < (GRADE_RANK[grade.from] ?? 0);
      out.push({
        ...base, kind: "grade-change", severity: down ? "warn" : "info",
        message: `${cur.symbol} grade changed ${grade.from} → ${grade.to}${cur.score != null ? ` (score ${cur.score})` : ""}, held for ${PERSISTENCE} snapshots.`,
        from: grade.from, to: grade.to,
      });
    }

    const routable = confirmedChange(history, i, "routable");
    if (routable) {
      out.push(routable.to
        ? { ...base, kind: "routability-change", severity: "info", message: `${cur.symbol} is tradable through Trova again.`, from: "not tradable", to: "tradable" }
        : { ...base, kind: "routability-change", severity: "warn", message: `${cur.symbol} is no longer tradable through Trova${cur.not_routable_reason ? ` — ${cur.not_routable_reason}` : ""}.`, from: "tradable", to: "not tradable" });
    }

    const exit = exitShift(history, i);
    if (exit) {
      out.push({
        ...base, kind: "exit-change", severity: exit.dir < 0 ? "warn" : "info",
        message: `${cur.symbol} exit score ${exit.dir < 0 ? "fell" : "rose"} from about ${exit.baseline} to ${exit.to}, held for ${PERSISTENCE} snapshots.`,
        from: String(exit.baseline), to: String(exit.to),
      });
    }
  }
  return out;
}

export function sortSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) =>
    (b.detectedAt ?? 0) - (a.detectedAt ?? 0) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/** Change signals within the last `days` for the given mints (or the whole universe when omitted). */
/**
 * Tokens that were not in the previous snapshot. For a product about fragmentation this is the
 * alert the others miss: a company gaining a second token, or being tokenized for the first time.
 * Only fires for a mint whose first snapshot is inside the window, so day one of history is not
 * reported as 562 new tokens.
 */
export function detectNewVariants(rows: SnapshotPoint[], windowStart: number): Signal[] {
  const dates = [...new Set(rows.map((r) => r.snapshot_date))].sort();
  if (dates.length < 2) return [];
  const firstDate = dates[0];

  const firstSeen = new Map<string, SnapshotPoint>();
  for (const r of rows) {
    const prev = firstSeen.get(r.mint);
    if (!prev || r.snapshot_date < prev.snapshot_date) firstSeen.set(r.mint, r);
  }
  // How many tokens the asset already had the day before this one showed up.
  const perAssetOnDate = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = `${r.asset_id}|${r.snapshot_date}`;
    const set = perAssetOnDate.get(key) ?? new Set<string>();
    set.add(r.mint);
    perAssetOnDate.set(key, set);
  }

  const out: Signal[] = [];
  for (const [mint, row] of firstSeen) {
    if (row.snapshot_date === firstDate) continue;        // present from the start of our history
    const detectedAt = dayStart(row.snapshot_date);
    if (detectedAt < windowStart) continue;
    const prevDate = dates[dates.indexOf(row.snapshot_date) - 1];
    const before = perAssetOnDate.get(`${row.asset_id}|${prevDate}`)?.size ?? 0;
    out.push({
      assetId: row.asset_id, mint, symbol: row.symbol, detectedAt,
      kind: "new-variant",
      severity: "info",
      message: before === 0
        ? `${row.symbol} is the first token tracking ${row.asset_id.replace(/-/g, " ")}.`
        : `${row.symbol} is a new token for ${row.asset_id.replace(/-/g, " ")} — there ${before === 1 ? "was 1" : `were ${before}`} before it.`,
      from: String(before), to: String(before + 1),
    });
  }
  return out;
}

export async function getChangeSignals(opts: { mints?: string[]; days?: number } = {}) {
  const days = Math.max(1, Math.min(MAX_SIGNAL_DAYS, Math.round(opts.days ?? 30)));
  const now = Date.now();
  // Extra lookback so persistence and exit baselines have data at the start of the window.
  const since = isoDay(now - (days + MARKET_BASELINE_SNAPSHOTS + PERSISTENCE) * 86_400_000);
  const windowStart = dayStart(isoDay(now - days * 86_400_000));

  let query = `select=${COLUMNS}&snapshot_date=gte.${since}&order=snapshot_date.asc,id.asc`;
  if (opts.mints?.length) query += `&mint=in.(${opts.mints.join(",")})`;
  const rows = await selectRows<SnapshotPoint>("variant_snapshots", query);

  const byMint = new Map<string, SnapshotPoint[]>();
  for (const r of rows) {
    const list = byMint.get(r.mint);
    if (list) list.push(r);
    else byMint.set(r.mint, [r]);
  }

  const signals = [
    ...[...byMint.values()].flatMap(detectSignals),
    ...detectNewVariants(rows, windowStart),
  ].filter((s) => (s.detectedAt ?? 0) >= windowStart);
  const dates = [...new Set(rows.map((r) => r.snapshot_date))].sort();
  return { windowDays: days, historyDays: dates.length, latestDate: dates.at(-1) ?? null, signals: sortSignals(signals) };
}
