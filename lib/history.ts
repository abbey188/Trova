// Rating history — the monitoring half of Trova, read straight off the daily snapshots.
//
// A rating is not a verdict you read once; it is a line you watch. Two facts make the chart worth
// drawing, and both come out of `variant_snapshots` with no extra collection:
//   Ownership barely moves. TSLAx sat at 83 every day for nine days — what you own is structural.
//   Exit moves constantly. The same TSLAx ran 90 → 83 → 92 over that window, on liquidity alone.
// A market-only risk score cannot draw that picture, because it has nothing to hold still against.
//
// A FLAT line is a finding, not an absence of one: CLSKx held exit=1, liquidity $0 and 19 holders for
// nine consecutive days. `flat` says so explicitly rather than leaving it to be inferred from a chart.
//
// Gaps matter. A missed cron day means a MISSING point, never a zero — interpolating or defaulting
// would invent a crash that never happened. Series are the days we actually have, and `days` counts
// points, not the calendar span.

import { getChangeSignals, MAX_SIGNAL_DAYS } from "./signals";
import { selectRows } from "./supabase-rest";
import type { HistoryPoint, MonitoringStats, Rating, TrendSummary, VariantHistory } from "./types";

/** What getChangeSignals returns — accepted here so a caller's scan can be reused. */
type ChangeResult = Awaited<ReturnType<typeof getChangeSignals>>;

/** A trend needs something to compare against; one point is a reading, not a trend. */
const MIN_TREND_POINTS = 2;

/** Below this a score move is flicker, not a direction. Matches the borderline band in the rubric. */
const SCORE_NOISE = 3;

// `structure` and `market` are the column names the table shipped with, from before the pillars were
// renamed. PostgREST aliases them back to the names used everywhere else in the app.
const COLUMNS = [
  "snapshot_date", "mint", "asset_id", "symbol", "score", "grade",
  "ownership:structure", "exit:market",
  "liquidity_usd", "holders", "volume_24h_usd", "routable",
].join(",");

interface Row {
  snapshot_date: string;
  mint: string;
  asset_id: string;
  symbol: string;
  score: number | null;
  grade: string;
  ownership: number;
  exit: number;
  liquidity_usd: number | null;
  holders: number | null;
  volume_24h_usd: number | null;
  routable: boolean;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toPoint(r: Row): HistoryPoint {
  return {
    date: r.snapshot_date,
    score: num(r.score),
    grade: r.grade as Rating,
    ownership: r.ownership,
    exit: r.exit,
    liquidityUsd: num(r.liquidity_usd),
    holders: num(r.holders),
    volume24hUsd: num(r.volume_24h_usd),
    routable: r.routable,
  };
}

/** Percent change between two readings, or null when the baseline is missing or zero. */
function changePct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** First and last reading of a field that actually reported — gaps are skipped, never zero-filled. */
function ends<K extends keyof HistoryPoint>(points: HistoryPoint[], key: K): [number | null, number | null] {
  const reported = points.filter((p) => typeof p[key] === "number") as (HistoryPoint & Record<K, number>)[];
  if (reported.length === 0) return [null, null];
  return [reported[0][key], reported[reported.length - 1][key]];
}

/**
 * What the series says as one line of facts. Purely descriptive — it reports the move that happened,
 * never an expected one.
 */
export function summariseTrend(points: HistoryPoint[]): TrendSummary {
  const empty: TrendSummary = {
    days: points.length,
    scoreChange: null, scoreFrom: null, scoreTo: null,
    liquidityChangePct: null, holdersChange: null,
    direction: "flat", flat: false, gradeChanged: false, lostRoutability: false,
  };
  if (points.length < MIN_TREND_POINTS) return empty;

  const [scoreFrom, scoreTo] = ends(points, "score");
  const scoreChange = scoreFrom != null && scoreTo != null ? scoreTo - scoreFrom : null;

  const [liqFrom, liqTo] = ends(points, "liquidityUsd");
  const [holdFrom, holdTo] = ends(points, "holders");

  const first = points[0];
  const last = points[points.length - 1];

  // Flat means nothing moved at all across the whole window — a dead token looks exactly like this.
  const flat =
    points.every((p) => p.score === first.score && p.exit === first.exit && p.ownership === first.ownership) &&
    (liqFrom == null || liqFrom === liqTo);

  const direction: TrendSummary["direction"] =
    scoreChange == null || Math.abs(scoreChange) < SCORE_NOISE ? "flat" : scoreChange > 0 ? "up" : "down";

  return {
    days: points.length,
    scoreChange, scoreFrom, scoreTo,
    liquidityChangePct: changePct(liqFrom, liqTo),
    holdersChange: holdFrom != null && holdTo != null ? holdTo - holdFrom : null,
    direction,
    flat,
    gradeChanged: first.grade !== last.grade,
    lostRoutability: first.routable && !last.routable,
  };
}

/**
 * Daily history for each mint, oldest first, with its trend summary. Mints with no snapshots are
 * simply absent from the map — a token we have never seen has no history, which is not an error.
 */
export async function getVariantHistory(mints: string[], days = 30): Promise<Map<string, VariantHistory>> {
  const out = new Map<string, VariantHistory>();
  const unique = [...new Set(mints)].filter(Boolean);
  if (unique.length === 0) return out;

  const window = Math.max(1, Math.min(MAX_SIGNAL_DAYS, Math.round(days)));
  const since = isoDay(Date.now() - window * 86_400_000);

  const query =
    `select=${COLUMNS}&snapshot_date=gte.${since}` +
    `&mint=in.(${unique.join(",")})&order=snapshot_date.asc,id.asc`;

  const rows = await selectRows<Row>("variant_snapshots", query);

  const byMint = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byMint.get(r.mint);
    if (list) list.push(r);
    else byMint.set(r.mint, [r]);
  }

  for (const [mint, list] of byMint) {
    const points = list.map(toPoint);
    out.set(mint, {
      mint,
      assetId: list[0].asset_id,
      symbol: list[0].symbol,
      points,
      trend: summariseTrend(points),
    });
  }
  return out;
}

/**
 * What Trova watched, across everything — the proof on the home screen that this is monitoring and
 * not a one-off reading. Counts come from the same persistence-checked signals the feed shows, so
 * the number on the dashboard and the list on Updates can never disagree.
 */
export async function getMonitoringStats(days = 7, change?: ChangeResult): Promise<MonitoringStats> {
  const window = Math.max(1, Math.min(MAX_SIGNAL_DAYS, Math.round(days)));
  // Callers that already ran the universe-wide scan pass it in: detecting signals reads every
  // snapshot for ~560 mints, and the home screen must not pay for that twice in one request.
  const { signals, historyDays, latestDate } = change ?? (await getChangeSignals({ days: window }));

  const tracked = latestDate
    ? await selectRows<{ mint: string }>("variant_snapshots", `select=mint&snapshot_date=eq.${latestDate}`)
    : [];

  const count = (kind: string) => signals.filter((s) => s.kind === kind).length;

  return {
    windowDays: window,
    historyDays,
    latestDate,
    variantsTracked: new Set(tracked.map((t) => t.mint)).size,
    ratingsChangedAndHeld: count("grade-change"),
    // Losing tradability is emitted as a "warn", so it is matched on direction, not severity —
    // matching on severity counted zero every time.
    becameUntradable: signals.filter((s) => s.kind === "routability-change" && s.to === "not tradable").length,
    tierMoves: count("tier-change"),
    newVariants: count("new-variant"),
  };
}
