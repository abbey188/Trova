// The collateral sheet and the collateral file — what a lender's risk team needs about a tokenized
// stock, and nothing it has to take on trust. Server-only.
//
// Every figure is one of three things: reported by the issuer (redemption), read from the mint on
// Solana (issuer controls), or measured by quoting a real round trip (exit). The lender numbers are
// arithmetic on those measurements, with the inequality stated — never a recommendation.
//
// Measurements began on 2026-10-12. A token with no stored ladder says so; nothing is filled in.

import { getBackpackIssuedMints, getExternalKlines, type BpKline } from "./backpack";
import { latestMeasurements, type StoredExit } from "./exit-store";
import { selectRows } from "./supabase-rest";
import { getMintFacts } from "./token-extensions";
import { METHOD_VERSION } from "./trust-score";
import type { ExitQuote, IssuerControls, MeasuredExit } from "./types";

/** A liquidator keeps at least this much of the bonus after selling, in points. */
export const LIQUIDATOR_MARGIN_PCT = 1;
export const BONUSES_PCT = [3, 5, 7.5, 10];

export interface SessionExit {
  takenAt: string;
  /** Cost of a $5,000 round trip in %, or null when it had no route or was not quoted. */
  cost5kPct: number | null;
  status5k: ExitQuote["status"] | "not-quoted";
  /** Largest measured size that left for under 1% / 5%, and the smallest size above it that did not. */
  under1Usd: number | null;
  over1Usd: number | null;
  under5Usd: number | null;
  over5Usd: number | null;
  filledBy: "pools" | "market-maker" | null;
  rungs: { usdSize: number; status: ExitQuote["status"]; roundTripPct: number | null; filledBy: "pools" | "market-maker" | null; poolsRoundTripPct: number | null }[];
}

export interface CollateralRow {
  mint: string;
  symbol: string;
  assetId: string;
  assetClass: string | null;
  issuer: string;
  /** direct-share | backed-tracker | non-redeemable-listed | unreported | leveraged | pre-ipo-exposure */
  instrumentClass: string;
  /** share_redeemable | cash_redeemable | not_redeemable | null when the issuer reports nothing */
  redemption: string | null;
  speculative: boolean;
  ownershipScore: number;
  holders: number | null;
  controls: IssuerControls | null;
  /** Latest ladder quoted in US market hours, and the latest quoted outside them. */
  open: SessionExit | null;
  closed: SessionExit | null;
  /** Largest in-hours size a liquidator could sell and keep LIQUIDATOR_MARGIN_PCT of a 5% bonus. */
  liquidatableAt5Usd: number | null;
}

function bracket(rungs: SessionExit["rungs"], thresholdPct: number): { under: number | null; over: number | null } {
  let under: number | null = null;
  let over: number | null = null;
  for (const r of rungs) {
    if (r.status !== "ok" && r.status !== "no-route") continue;
    const inside = r.status === "ok" && r.roundTripPct != null && r.roundTripPct < thresholdPct;
    if (inside && over == null) under = r.usdSize;
    else if (!inside && over == null) over = r.usdSize;
  }
  return { under, over };
}

function sessionExit(m: MeasuredExit | null | undefined): SessionExit | null {
  if (!m || m.rungs.length === 0) return null;
  const rungs = [...m.rungs].sort((a, b) => a.usdSize - b.usdSize).map((r) => ({
    usdSize: r.usdSize, status: r.status, roundTripPct: r.roundTripPct, filledBy: r.liquidity ?? null, poolsRoundTripPct: r.poolsRoundTripPct ?? null,
  }));
  const rule = rungs.find((r) => r.usdSize === 5_000);
  const one = bracket(rungs, 1);
  const five = bracket(rungs, 5);
  return {
    takenAt: m.takenAt,
    cost5kPct: rule?.status === "ok" ? rule.roundTripPct : null,
    status5k: rule?.status ?? "not-quoted",
    under1Usd: one.under, over1Usd: one.over, under5Usd: five.under, over5Usd: five.over,
    filledBy: rule?.filledBy ?? null,
    rungs,
  };
}

/** Largest size whose measured exit cost leaves the liquidator `LIQUIDATOR_MARGIN_PCT` of the bonus. */
export function liquidatable(exit: SessionExit | null, bonusPct: number): { sizeUsd: number | null; costPct: number | null; nextUsd: number | null } {
  if (!exit) return { sizeUsd: null, costPct: null, nextUsd: null };
  const { under, over } = bracket(exit.rungs, bonusPct - LIQUIDATOR_MARGIN_PCT);
  return { sizeUsd: under, costPct: exit.rungs.find((r) => r.usdSize === under)?.roundTripPct ?? null, nextUsd: over };
}

interface SnapshotRow {
  mint: string; symbol: string; asset_id: string; asset_class: string | null; issuer: string | null;
  instrument_class: string; stock_variant_tier: string | null; speculative: boolean; structure: number; holders: number | null;
}

async function latestSnapshot(filter = ""): Promise<{ date: string | null; rows: SnapshotRow[] }> {
  const [latest] = await selectRows<{ snapshot_date: string }>("variant_snapshots", "select=snapshot_date&order=snapshot_date.desc&limit=1");
  if (!latest) return { date: null, rows: [] };
  const rows = await selectRows<SnapshotRow>(
    "variant_snapshots",
    `select=mint,symbol,asset_id,asset_class,issuer,instrument_class,stock_variant_tier,speculative,structure,holders&snapshot_date=eq.${latest.snapshot_date}${filter}&order=id`,
  );
  return { date: latest.snapshot_date, rows };
}

function toRow(r: SnapshotRow, stored: StoredExit | undefined, controls: IssuerControls | null, backpackIssued = false): CollateralRow {
  const open = sessionExit(stored?.scored);
  return {
    mint: r.mint,
    symbol: r.symbol,
    assetId: r.asset_id,
    assetClass: r.asset_class,
    // A ticker is not an issuer (older snapshots stored the token's own symbol as its label).
    issuer: backpackIssued ? "Backpack Securities" : r.issuer && r.issuer.toUpperCase() !== r.symbol.toUpperCase() && r.issuer !== "Unknown" ? r.issuer : "Not reported",
    instrumentClass: r.instrument_class,
    redemption: r.stock_variant_tier,
    speculative: r.speculative,
    ownershipScore: r.structure,
    holders: r.holders,
    controls,
    open,
    closed: sessionExit(stored?.closed),
    liquidatableAt5Usd: liquidatable(open, 5).sizeUsd,
  };
}

/**
 * The sheet cut by who issues the token — the cut a risk team works in, because issuers differ in what
 * they can do to the token and in who fills it. Each segment is its own page under /lenders.
 */
export const SEGMENTS = [
  { slug: "ondo", label: "Ondo", blurb: "Ondo Global Markets tokens. Filled by market makers; their pools are close to empty.", match: (r: CollateralRow) => r.issuer === "Ondo" },
  { slug: "xstocks", label: "xStocks", blurb: "xStocks tokens, issued by Backed. Filled by pools and by market makers, depending on size and hour.", match: (r: CollateralRow) => r.issuer === "xStock" || r.issuer === "Backed" },
  { slug: "backpack", label: "Backpack", blurb: "Tokens issued by Backpack Securities, redeemable for the share itself. Filled mostly from pools.", match: (r: CollateralRow) => r.issuer === "Backpack Securities" },
  { slug: "private", label: "Private companies", blurb: "Exposure to companies with no public market, through an SPV. No redemption, and no listed share to compare against. Always labelled speculative.", match: (r: CollateralRow) => r.speculative },
  { slug: "funds-and-metals", label: "ETFs and metals", blurb: "Tokens tracking a fund or a metal rather than one company.", match: (r: CollateralRow) => !r.speculative && (r.assetClass === "etf" || r.assetClass === "metal") },
] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface CollateralSheet {
  asOf: string;
  methodVersion: string;
  snapshotDate: string | null;
  measuredSince: string;
  tokens: number;
  measuredInHours: number;
  measuredOutOfHours: number;
  rows: CollateralRow[];
}

/** Every tracked token, most absorbent first (in-hours capacity, then holders). */
export async function buildCollateralSheet(): Promise<CollateralSheet> {
  const [{ date, rows }, measured, backpack] = await Promise.all([latestSnapshot(), latestMeasurements(), getBackpackIssuedMints().catch(() => new Set<string>())]);
  const facts = await getMintFacts(rows.map((r) => r.mint)).catch(() => new Map());
  const out = rows
    .map((r) => toRow(r, measured.get(r.mint), facts.get(r.mint)?.controls ?? null, backpack.has(r.mint)))
    .sort((a, b) => (b.open?.under1Usd ?? -1) - (a.open?.under1Usd ?? -1) || (b.closed?.under1Usd ?? -1) - (a.closed?.under1Usd ?? -1) || (b.holders ?? 0) - (a.holders ?? 0));
  return {
    asOf: new Date().toISOString(),
    methodVersion: METHOD_VERSION,
    snapshotDate: date,
    measuredSince: "2026-10-12",
    tokens: out.length,
    measuredInHours: out.filter((r) => r.open).length,
    measuredOutOfHours: out.filter((r) => r.closed).length,
    rows: out,
  };
}

/** The real share's largest move across a market closure of two days or more, from daily candles. */
function closureGap(klines: BpKline[] | null): { maxPct: number; closures: number } | null {
  if (!klines || klines.length < 20) return null;
  const days = klines
    .filter((k) => Number(k.volume) > 0)
    .map((k) => ({ t: Date.parse(k.start.replace(" ", "T") + "Z"), open: Number(k.open), close: Number(k.close) }))
    .filter((d) => Number.isFinite(d.t) && d.open > 0 && d.close > 0)
    .sort((a, b) => a.t - b.t);
  let maxPct = 0;
  let closures = 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i].t - days[i - 1].t < 2.5 * 86_400_000) continue;
    closures++;
    maxPct = Math.max(maxPct, Math.abs(days[i].open / days[i - 1].close - 1) * 100);
  }
  return closures >= 10 ? { maxPct, closures } : null;
}

export interface CollateralFile extends CollateralRow {
  asOf: string;
  methodVersion: string;
  measuredSince: string;
  /** Only where the token tracks one listed share (stocks and ETFs, never pre-IPO or per-ounce metals). */
  closureGap: { maxPct: number; closures: number; ticker: string } | null;
  /** For each liquidation bonus: what a liquidator could sell, and the threshold that survives the gap. */
  liquidation: { bonusPct: number; sizeUsd: number | null; exitCostPct: number | null; nextSizeUsd: number | null; thresholdPct: number | null }[];
  /** Capacity per stored day and session, oldest first — the history a lender would track. */
  history: { date: string; session: "open" | "closed"; cost5kPct: number | null; under1Usd: number | null; under5Usd: number | null }[];
  notes: string[];
}

/** One token's full file, or null when Trova does not track the mint. */
export async function buildCollateralFile(mint: string): Promise<CollateralFile | null> {
  const [{ rows }, measured] = await Promise.all([latestSnapshot(`&mint=eq.${mint}`), latestMeasurements([mint])]);
  const snap = rows[0];
  if (!snap) return null;
  const [facts, backpack] = await Promise.all([getMintFacts([mint]).catch(() => new Map()), getBackpackIssuedMints().catch(() => new Set<string>())]);
  const row = toRow(snap, measured.get(mint), facts.get(mint)?.controls ?? null, backpack.has(mint));

  const oneForOne = (snap.asset_class === "stock" || snap.asset_class === "etf") && !snap.speculative;
  const ticker = snap.symbol.replace(/(x|on)$/, "").toUpperCase();
  const yearAgo = Math.floor(Date.now() / 1000) - 365 * 86_400;
  const gap = oneForOne ? closureGap(await getExternalKlines(ticker, "1d", yearAgo).catch(() => null)) : null;

  const history = await selectRows<{ snapshot_date: string; session: "open" | "closed"; size_usd: number; status: ExitQuote["status"]; round_trip_pct: number | null }>(
    "exit_measurements", `select=snapshot_date,session,size_usd,status,round_trip_pct&mint=eq.${mint}&order=id`,
  ).catch(() => []);
  const days = new Map<string, SessionExit["rungs"]>();
  for (const h of history) {
    const key = `${h.snapshot_date}|${h.session}`;
    (days.get(key) ?? days.set(key, []).get(key)!).push({ usdSize: h.size_usd, status: h.status, roundTripPct: h.round_trip_pct == null ? null : Number(h.round_trip_pct), filledBy: null, poolsRoundTripPct: null });
  }

  const notes: string[] = [];
  if (!row.open) notes.push("No in-hours measurement is stored for this token yet.");
  if (!gap && oneForOne) notes.push("The real share's price history could not be read, so no closure gap or threshold is shown.");
  if (!oneForOne) notes.push("This token does not track one listed share, so no closure gap or threshold is shown.");
  notes.push("Exit costs are round trips (buy, then sell straight back), so they overstate what a liquidator pays to sell once.");

  return {
    ...row,
    asOf: new Date().toISOString(),
    methodVersion: METHOD_VERSION,
    measuredSince: "2026-10-12",
    closureGap: gap ? { ...gap, ticker } : null,
    liquidation: BONUSES_PCT.map((bonusPct) => {
      const l = liquidatable(row.open, bonusPct);
      return {
        bonusPct, sizeUsd: l.sizeUsd, exitCostPct: l.costPct, nextSizeUsd: l.nextUsd,
        thresholdPct: gap && l.sizeUsd != null && l.costPct != null ? 100 - bonusPct - l.costPct - gap.maxPct : null,
      };
    }),
    history: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rungs]) => {
      const [date, session] = key.split("|") as [string, "open" | "closed"];
      const sorted = rungs.sort((a, b) => a.usdSize - b.usdSize);
      const rule = sorted.find((r) => r.usdSize === 5_000);
      return { date, session, cost5kPct: rule?.status === "ok" ? rule.roundTripPct : null, under1Usd: bracket(sorted, 1).under, under5Usd: bracket(sorted, 5).under };
    }),
    notes,
  };
}

const yn = (b: boolean | null | undefined) => (b == null ? "" : b ? "yes" : "no");
const num = (n: number | null | undefined, digits = 2) => (n == null ? "" : Number(n).toFixed(digits));
const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** The sheet as CSV: one row per token, units in the header, blanks where nothing was measured. */
export function sheetCsv(sheet: CollateralSheet): string {
  const head = [
    "symbol", "mint", "company", "asset_class", "issuer", "redemption", "speculative", "ownership_score_0_100",
    "issuer_can_move_tokens", "issuer_can_pause", "paused_now", "issuer_can_freeze", "issuer_can_mint", "new_accounts_frozen", "hook_program_attached", "transfer_fee_bps",
    "in_hours_measured_at_utc", "in_hours_5k_round_trip_pct", "in_hours_largest_size_under_1pct_usd", "in_hours_largest_size_under_5pct_usd", "in_hours_filled_by",
    "liquidatable_inside_5pct_bonus_usd",
    "out_of_hours_measured_at_utc", "out_of_hours_5k_status", "out_of_hours_5k_round_trip_pct", "out_of_hours_largest_size_under_1pct_usd",
  ];
  const lines = sheet.rows.map((r) => [
    r.symbol, r.mint, r.assetId, r.assetClass ?? "", r.issuer, r.redemption ?? "not reported", yn(r.speculative), r.ownershipScore,
    yn(r.controls?.canSeize), yn(r.controls?.canPause), yn(r.controls?.paused), yn(r.controls?.canFreeze), yn(r.controls?.canMint),
    yn(r.controls?.newAccountsFrozen), yn(r.controls ? r.controls.hookProgram != null : null), r.controls?.transferFeeBps ?? "",
    r.open?.takenAt ?? "", num(r.open?.cost5kPct), r.open?.under1Usd ?? "", r.open?.under5Usd ?? "", r.open?.filledBy ?? "",
    r.liquidatableAt5Usd ?? "",
    r.closed?.takenAt ?? "", r.closed?.status5k ?? "", num(r.closed?.cost5kPct), r.closed?.under1Usd ?? "",
  ].map(cell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}
