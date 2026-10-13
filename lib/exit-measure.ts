// The daily exit measurement: a ladder of round trips per token, quoted and stored.
//
// Quotes are the scarce thing (about one a second on our Jupiter tier), so the ladder is climbed
// only as far as it tells us something. The $5,000 rung is the one the "tradable" rule reads and is
// always taken. A token that fails it badly is not asked again at $50,000; one that passes it under
// 1% is not asked at $500. Sizes that were never quoted are simply absent from the record.

import { exitCost, type ExitCost } from "./jupiter";
import { measuredMints, usSession, writeMeasurements, type ExitMeasurementRow } from "./exit-store";
import { selectRows } from "./supabase-rest";
import { RULE_SIZE_USD } from "./trust-score";

const CLIMB = [50_000, 250_000, 1_000_000, 5_000_000, 25_000_000];
const STOP_CLIMBING_PCT = 5;   // past this the next size up can only be worse
const DEAD_PCT = 50;           // a $5,000 round trip losing half is not worth asking again at $500

export interface MeasureTarget { mint: string; symbol: string }

/** Every rung worth quoting for one token, in the order taken. "unavailable" rungs are dropped. */
/** One rung, asked again after a pause when Jupiter could not be reached — a stored ladder with a
 *  hole in it would understate what the token can absorb. */
async function rung(mint: string, size: number): Promise<ExitCost> {
  let r = await exitCost(mint, size, 100, { quick: true });
  for (let retry = 0; retry < 2 && r.status === "unavailable"; retry++) {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    r = await exitCost(mint, size, 100, { quick: true });
  }
  return r;
}

export async function measureLadder(mint: string): Promise<ExitCost[]> {
  const rungs: ExitCost[] = [];
  const rule = await rung(mint, RULE_SIZE_USD);
  // No answer on the rule rung: store nothing, so the next call measures this token again.
  if (rule.status === "unavailable") return [];
  rungs.push(rule);

  const cost = rule.status === "ok" ? rule.roundTripPct ?? 100 : null;
  if (cost != null && cost < STOP_CLIMBING_PCT) {
    for (const size of CLIMB) {
      const r = await rung(mint, size);
      rungs.push(r);
      if (r.status !== "ok" || (r.roundTripPct ?? 100) >= STOP_CLIMBING_PCT) break;
    }
  }
  // Whether anything smaller works only matters when $5,000 neither passed cleanly nor failed outright.
  if (cost != null && cost >= 1 && cost < DEAD_PCT) rungs.push(await rung(mint, 500));

  return rungs.filter((r) => r.status !== "unavailable");
}

export function toRows(target: MeasureTarget, rungs: ExitCost[], date: string, session: "open" | "closed", takenAt = new Date().toISOString()): ExitMeasurementRow[] {
  return rungs.map((r) => ({
    mint: target.mint,
    symbol: target.symbol,
    snapshot_date: date,
    taken_at: takenAt,
    session,
    size_usd: r.usdSize,
    status: r.status,
    round_trip_pct: r.roundTripPct,
    liquidity: r.liquidity,
    pools_round_trip_pct: r.poolsRoundTripPct,
    route_labels: r.routeLabels,
  }));
}

/**
 * The tokens to measure, most worth measuring first: tradable ones, then by score. The dead tail
 * costs two or three quotes a token and is reached when the budget allows.
 */
export async function measureTargets(): Promise<MeasureTarget[]> {
  const [latest] = await selectRows<{ snapshot_date: string }>("variant_snapshots", "select=snapshot_date&order=snapshot_date.desc&limit=1");
  if (!latest) return [];
  const rows = await selectRows<{ mint: string; symbol: string; routable: boolean; score: number | null; issuer: string | null; liquidity_usd: number | null }>(
    "variant_snapshots",
    `select=mint,symbol,routable,score,issuer,liquidity_usd&snapshot_date=eq.${latest.snapshot_date}&order=id`,
  );
  return rows
    .sort((a, b) => Number(b.routable) - Number(a.routable) || (b.score ?? -1) - (a.score ?? -1) || (b.liquidity_usd ?? 0) - (a.liquidity_usd ?? 0))
    .map((r) => ({ mint: r.mint, symbol: r.symbol }));
}

export interface MeasureRunSummary {
  date: string;
  session: "open" | "closed";
  targets: number;
  alreadyDone: number;
  measured: number;
  rowsWritten: number;
  remaining: number;
  seconds: number;
}

/**
 * Measure until the budget runs out, skipping tokens already measured this date and session. Safe to
 * call repeatedly: each call carries on where the last one stopped.
 */
export async function runMeasurement(opts: { budgetMs?: number; limit?: number; dryRun?: boolean; onToken?: (t: MeasureTarget, rungs: ExitCost[]) => void } = {}): Promise<MeasureRunSummary> {
  const started = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const session = usSession();
  const targets = await measureTargets();
  const done = await measuredMints(date, session).catch(() => new Set<string>());
  const todo = targets.filter((t) => !done.has(t.mint)).slice(0, opts.limit ?? Infinity);

  let measured = 0;
  let rowsWritten = 0;
  for (const t of todo) {
    if (opts.budgetMs != null && Date.now() - started > opts.budgetMs) break;
    // Stop at the bell (or the open): the tokens left belong to the other session's run, and carrying
    // on would write over that session's measurements for today.
    if (usSession() !== session) break;
    const rungs = await measureLadder(t.mint);
    opts.onToken?.(t, rungs);
    // A token Jupiter could not be reached for is left unmeasured, so the next call tries again.
    if (rungs.length === 0) continue;
    // Written token by token: a run that is cut short keeps everything it finished.
    // A failed write (a network drop) costs that token, which the next call measures again.
    if (!opts.dryRun) {
      try {
        rowsWritten += await writeMeasurements(toRows(t, rungs, date, session));
      } catch (e) {
        console.error(`could not store ${t.symbol}:`, e instanceof Error ? e.message : e);
        continue;
      }
    }
    measured++;
  }

  return {
    date, session,
    targets: targets.length,
    alreadyDone: done.size,
    measured,
    rowsWritten,
    remaining: Math.max(0, targets.length - done.size - measured),
    seconds: Math.round((Date.now() - started) / 1000),
  };
}
