// Why THIS token is rated the way it is — generated from its own numbers, never from shared copy.
//
// Tesla's A and Apple's A are not the same A. One may be held back by cash-only redemption, the
// other by an unreported fill quality; one may be deepening, the other thinning. A rating page that
// prints the same paragraph under every token is a brochure, and it goes stale the day a token's
// market changes. So every line here is derived from the token's inputs at request time:
//
//   headline     one sentence naming this token's binding constraint
//   drivers      every component with the fact behind it, weakest first
//   scenarios    "what would move it" — each one RE-SCORED through scoreVariant on a modified copy
//                of the token, so the numbers are the rubric's own answer, not an estimate
//   inputs       the five confidence inputs, from the engine's own list
//   benefits     what holding it entitles you to, "not stated" wherever no source says
//
// Factual only. A scenario is a sensitivity ("if liquidity fell under $50k, this is the result"),
// never a forecast that it will.

import { count, usd } from "./format";
import { GRADE_CUTOFFS, MIN_LIQUIDITY_USD, redemptionNote, reportedInputs, scoreVariant, type ScoreContext } from "./trust-score";
import type { CorporateAction, Rating, TrendSummary, TrovaScore, TxzVariant } from "./types";

export type DriverKey = "redemption" | "product" | "liquidity" | "activity" | "holders" | "execution" | "advisory";

export interface Driver {
  key: DriverKey;
  pillar: "ownership" | "exit" | "cap";
  label: string;
  score: number | null;         // component score 0..100; null when not reported
  fact: string;                 // this token's number behind the score
  weight: string | null;        // e.g. "70% of Ownership"
}

export interface Scenario {
  key: string;
  label: string;                // "If it redeemed into the share"
  change: string;               // "Ownership 83 → 100"
  before: { score: number | null; grade: Rating; routable: boolean };
  after: { score: number | null; grade: Rating; routable: boolean };
  direction: "up" | "down";
}

export type BenefitStatus = "yes" | "reinvested" | "cash-value" | "partial" | "no" | "not-stated";

export interface Benefit {
  key: "value" | "redemption" | "dividends" | "voting";
  label: string;
  status: BenefitStatus;
  note: string;
}

export interface Explanation {
  headline: string;
  /** The single component whose improvement would lift the score most. Null for a perfect token. */
  holdingBack: Driver | null;
  drivers: Driver[];
  scenarios: Scenario[];
  inputs: { key: string; label: string; reported: boolean }[];
  benefits: Benefit[];
  /** Monitoring, in one line: how the rating has moved while we watched it. Null without history. */
  movement: string | null;
}

// ---------------------------------------------------------------------------------------------

const money = (n: number | null | undefined) => usd(n ?? 0, { compact: true });

function redemptionShort(v: TxzVariant): string {
  switch (v.stockVariantTier) {
    case "share_redeemable": return "redeemable for the share itself";
    case "cash_redeemable": return "redeemable for cash value, not the share";
    case "not_redeemable": return "no redemption offered";
    default: return "redemption not reported";
  }
}

/** The neutral label, for sentences that are otherwise positive. */
function redemptionLabel(v: TxzVariant): string {
  switch (v.stockVariantTier) {
    case "share_redeemable": return "share-redeemable";
    case "cash_redeemable": return "cash-redeemable";
    case "not_redeemable": return "not redeemable";
    default: return "redemption unreported";
  }
}

function redemptionFact(v: TxzVariant, s: TrovaScore): string {
  const note = redemptionNote(s);
  if (note) return note;
  switch (v.stockVariantTier) {
    case "share_redeemable": return "The issuer redeems it for the share itself.";
    case "cash_redeemable": return "The issuer redeems it for the share's cash value, not the share. Share redemption would score 100.";
    case "not_redeemable": return "The issuer offers no redemption — the market is the only way out.";
    default: return "Not reported.";
  }
}

function productFact(s: TrovaScore): string {
  const p = s.ownership.components.product;
  if (p === 0) return "Exposure through an SPV. The issuer states it confers no ownership, voting, dividend or information rights.";
  if (p === 40) return "Leveraged exposure that resets daily — over longer holds it drifts from the underlying.";
  return "Full economic exposure to the underlying.";
}

/** Where a calibrated component sits. The anchors put 50 at the median tradable token. */
function band(score: number): string {
  if (score >= 90) return "among the strongest of any tokenized asset";
  if (score >= 50) return "above the typical tradable token";
  if (score >= 25) return "below the typical tradable token";
  if (score > 0) return "far below the typical tradable token";
  return "effectively none";
}

function signedCount(n: number): string {
  return `${n >= 0 ? "up" : "down"} ${count(Math.abs(n))}`;
}

function liquidityFact(v: TxzVariant, s: TrovaScore, trend?: TrendSummary | null): string {
  const liq = v.market.liquidity ?? 0;
  let fact = `${money(liq)} of on-chain depth — ${band(s.exit.components.liquidity)}`;
  if (trend?.liquidityChangePct != null && Math.abs(trend.liquidityChangePct) >= 1) {
    const pct = Math.abs(trend.liquidityChangePct);
    // Rounding 99.97% to "100%" would claim it all went, while dollars remain on the line above.
    const size = pct >= 99.5 && liq > 0 && trend.liquidityChangePct < 0 ? "more than 99%" : `${pct.toFixed(0)}%`;
    fact += `, ${trend.liquidityChangePct >= 0 ? "up" : "down"} ${size} over ${trend.days} days`;
  }
  if (liq < MIN_LIQUIDITY_USD) fact += `. Under the ${money(MIN_LIQUIDITY_USD)} Trova needs to route a trade`;
  return `${fact}.`;
}

function activityFact(v: TxzVariant): string {
  const trades = v.market.trade24h ?? 0;
  const vol = v.market.volume24hUSD ?? 0;
  if (trades <= 0) return "No trades in the last 24 hours.";
  return `${money(vol)} traded in the last 24 hours across ${count(trades)} trade${trades === 1 ? "" : "s"}.`;
}

function holdersFact(v: TxzVariant, trend?: TrendSummary | null): string {
  const h = v.market.holder ?? 0;
  if (h <= 0) return "Holder count not reported.";
  let fact = `${count(h)} wallets hold it`;
  if (trend?.holdersChange != null && trend.holdersChange !== 0) fact += `, ${signedCount(trend.holdersChange)} over ${trend.days} days`;
  return `${fact}.`;
}

function executionFact(v: TxzVariant, s: TrovaScore): string {
  const e = s.exit.components.execution;
  if (e == null) return "Not reported for this token, so the other three carry Exit.";
  const bot = v.executionQuality?.botVolumeRatio;
  const botLine = bot != null && bot >= 0.5 ? ` ${Math.round(bot * 100)}% of its volume is bots or market makers.` : "";
  return `Fill quality ${e}/100 on tokens.xyz's execution measure.${botLine}`;
}

// ---------------------------------------------------------------------------------------------

function drivers(v: TxzVariant, s: TrovaScore, trend?: TrendSummary | null): Driver[] {
  const c = s.ownership.components;
  const x = s.exit.components;
  const exitWeight = x.execution == null ? "1 of 3 in Exit" : "1 of 4 in Exit";
  const list: Driver[] = [
    { key: "redemption", pillar: "ownership", label: "Can you swap it for the real share?", score: c.redemption, fact: redemptionFact(v, s), weight: "70% of Ownership" },
    { key: "product", pillar: "ownership", label: "What the token entitles you to", score: c.product, fact: productFact(s), weight: "30% of Ownership" },
    { key: "liquidity", pillar: "exit", label: "Depth of the market", score: x.liquidity, fact: liquidityFact(v, s, trend), weight: exitWeight },
    { key: "activity", pillar: "exit", label: "How much it actually trades", score: x.activity, fact: activityFact(v), weight: exitWeight },
    { key: "holders", pillar: "exit", label: "How many people hold it", score: x.holders, fact: holdersFact(v, trend), weight: exitWeight },
    { key: "execution", pillar: "exit", label: "Quality of the fills", score: x.execution, fact: executionFact(v, s), weight: x.execution == null ? null : exitWeight },
  ];
  if (s.advisory) {
    list.unshift({
      key: "advisory",
      pillar: "cap",
      label: "Warning against this token",
      score: null,
      fact: `A tokens.xyz ${s.advisory.status} warning caps the rating whatever the market does${s.advisory.reason ? `: ${s.advisory.reason}` : "."}`,
      weight: null,
    });
  }
  return list;
}

/**
 * How many points the combined score would gain if this one component were perfect. Used only to
 * ORDER the drivers — the numbers shown to a user always come from a real re-score.
 */
function leverage(d: Driver, s: TrovaScore): number {
  if (d.score == null || d.pillar === "cap") return d.pillar === "cap" ? Infinity : -1;
  const o = Math.max(s.ownership.score, 1);
  const e = Math.max(s.exit.score, 1);
  const exitParts = s.exit.components.execution == null ? 3 : 4;
  const gainPillar =
    d.key === "redemption" ? (100 - d.score) * 0.7
    : d.key === "product" ? (100 - d.score) * 0.3
    : (100 - d.score) / exitParts;
  const now = Math.sqrt(o * e);
  const after = d.pillar === "ownership" ? Math.sqrt(Math.min(100, o + gainPillar) * e) : Math.sqrt(o * Math.min(100, e + gainPillar));
  return after - now;
}

// ---------------------------------------------------------------------------------------------

/** A modified copy of the token, re-scored through the real engine. */
function rescore(v: TxzVariant, ctx: ScoreContext, patch: (c: TxzVariant) => void): TrovaScore {
  const copy: TxzVariant = { ...v, market: { ...v.market }, executionQuality: v.executionQuality ? { ...v.executionQuality } : v.executionQuality };
  patch(copy);
  return scoreVariant(copy, ctx);
}

const snap = (s: TrovaScore) => ({ score: s.score, grade: s.grade, routable: s.routable });

function scenarios(v: TxzVariant, s: TrovaScore, ctx: ScoreContext): Scenario[] {
  const out: (Scenario & { priority: number })[] = [];
  const before = snap(s);
  const push = (key: string, label: string, change: string, after: TrovaScore, priority: number) => {
    const a = snap(after);
    // A scenario that moves nothing teaches nothing.
    if (a.score === before.score && a.routable === before.routable && a.grade === before.grade) return;
    const direction = (a.score ?? -1) > (before.score ?? -1) || (a.routable && !before.routable) ? "up" : "down";
    out.push({ key, label, change, before, after: a, direction, priority });
  };

  // Ownership: redemption into the share, when it isn't already. Not offered for pre-IPO exposure:
  // there is no listed share to redeem into, and showing a speculative token climbing to an A
  // would read as a promise the rubric cannot make.
  if (v.stockVariantTier !== "share_redeemable" && s.instrument.class !== "pre-ipo-exposure") {
    const after = rescore(v, ctx, (c) => { c.stockVariantTier = "share_redeemable"; });
    push("redeem-share", "If it redeemed into the share", `Ownership ${s.ownership.score} → ${after.ownership.score}`, after, s.routable ? 3 : 2);
  }

  if (s.routable) {
    // Exit: the market thinning out under the routing floor.
    const after = rescore(v, ctx, (c) => { c.market.liquidity = MIN_LIQUIDITY_USD - 1_000; });
    push("liquidity-floor", `If liquidity fell under ${money(MIN_LIQUIDITY_USD)}`, `Exit ${s.exit.score} → ${after.exit.score}`, after, 2);
  } else if (!s.advisory) {
    // Exit: what a typical market would do for a token that has none. 50 on every anchor is the
    // median tradable token, so this is "if it traded like an ordinary one".
    const after = rescore(v, ctx, (c) => {
      c.market.liquidity = Math.max(c.market.liquidity ?? 0, 300_000);
      c.market.trade24h = Math.max(c.market.trade24h ?? 0, 2_500);
      c.market.volume24hUSD = Math.max(c.market.volume24hUSD ?? 0, 150_000);
    });
    push("typical-market", "If it traded like a typical token", `Exit ${s.exit.score} → ${after.exit.score}`, after, 4);
  }

  // The cap: a warning issued, or the one in force lifted.
  if (s.advisory) {
    const after = rescore(v, ctx, (c) => { c.advisory = null; });
    push("advisory-cleared", "If the warning were lifted", `Uncapped: ${after.score ?? "NR"}`, after, 5);
  } else {
    const after = rescore(v, ctx, (c) => { c.advisory = { status: "caution", reason: null }; });
    push("advisory-issued", "If a caution warning were issued", `Capped at ${GRADE_CUTOFFS.C}`, after, 1);
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 3).map(({ priority: _p, ...rest }) => rest);
}

// ---------------------------------------------------------------------------------------------

/** A current multiplier that is not a whole number means distributions were paid as extra balance. */
function reinvestedMultiplier(ca?: CorporateAction | null): number | null {
  const m = ca?.multiplier;
  if (m == null || !(m > 1)) return null;
  const whole = Math.max(1, Math.round(m));
  return Math.abs(m / whole - 1) > 1e-6 ? m : null;
}

function benefits(s: TrovaScore, v: TxzVariant, ca?: CorporateAction | null): Benefit[] {
  const preIpo = s.instrument.class === "pre-ipo-exposure";
  const leveraged = s.instrument.class === "leveraged";
  const reinvested = reinvestedMultiplier(ca);

  const value: Benefit = preIpo
    ? { key: "value", label: "Economic exposure", status: "partial", note: "Through an SPV, priced against private valuation marks — not a share of the company." }
    : leveraged
      ? { key: "value", label: "Economic exposure", status: "partial", note: "Leveraged and reset daily, so it drifts from the underlying over time." }
      : { key: "value", label: "Economic exposure", status: "yes", note: "Tracks the value of the underlying." };

  const redemption: Benefit =
    v.stockVariantTier === "share_redeemable" ? { key: "redemption", label: "Redeem for the share", status: "yes", note: "The issuer redeems it for the share itself." }
    : v.stockVariantTier === "cash_redeemable" ? { key: "redemption", label: "Redeem for the share", status: "cash-value", note: "Redeemable for the share's cash value, not the share." }
    : v.stockVariantTier === "not_redeemable" ? { key: "redemption", label: "Redeem for the share", status: "no", note: "No redemption — selling on the market is the only way out." }
    : { key: "redemption", label: "Redeem for the share", status: "not-stated", note: "Not reported by our sources." };

  const dividends: Benefit = preIpo
    ? { key: "dividends", label: "Dividends", status: "no", note: "The issuer states there are no dividend rights." }
    : reinvested
      ? { key: "dividends", label: "Dividends", status: "reinvested", note: `Paid as extra balance, not cash — seen on-chain as a ×${reinvested.toFixed(5)} multiplier.` }
      : { key: "dividends", label: "Dividends", status: "not-stated", note: "Not stated by the issuer, and none seen on-chain yet." };

  const voting: Benefit = preIpo
    ? { key: "voting", label: "Voting", status: "no", note: "The issuer states there are no voting rights." }
    : { key: "voting", label: "Voting", status: "not-stated", note: "Not stated by the issuer." };

  return [value, redemption, dividends, voting];
}

// ---------------------------------------------------------------------------------------------

function headline(v: TxzVariant, s: TrovaScore, holdingBack: Driver | null): string {
  if (s.hidden) return "Hidden: blocked by a tokens.xyz warning.";
  if (s.advisory) return `Capped by a tokens.xyz ${s.advisory.status} warning${s.advisory.reason ? ` — ${s.advisory.reason}` : ""}.`;
  if (!s.rated) {
    const reason = s.notRatedReason ?? "Not rated — too little reported to score honestly";
    return reason.endsWith(".") ? reason : `${reason}.`;
  }

  const liq = money(v.market.liquidity);
  const traded = (v.market.trade24h ?? 0) > 0;

  if (s.instrument.class === "pre-ipo-exposure") {
    return s.routable
      ? `You'd hold exposure through an SPV, not a share — though the market for it is ${s.exit.score >= 65 ? "deep" : "open"}, with ${liq} of depth.`
      : `You'd hold exposure through an SPV, not a share, and the market for it is thin: ${liq} of depth.`;
  }
  if (!s.routable) {
    const market = `${liq} of depth${traded ? "" : " and no trades in 24 hours"}`;
    return s.ownership.score >= GRADE_CUTOFFS.B
      ? `The paperwork is sound; the market is not — ${market}.`
      : `Weak on both halves: ${redemptionShort(v)}, and ${market}.`;
  }
  if (s.ownership.score >= GRADE_CUTOFFS.A && s.exit.score >= GRADE_CUTOFFS.A) {
    return `Strong on both halves: ${redemptionLabel(v)}, with ${liq} of depth.`;
  }
  if (holdingBack?.pillar === "ownership") {
    return `Easy to trade; held back by what you'd own — ${redemptionShort(v)}.`;
  }
  if (holdingBack?.pillar === "exit") {
    const fact =
      holdingBack.key === "liquidity" ? `${liq} of depth`
      : holdingBack.key === "activity" ? (traded ? `${money(v.market.volume24hUSD)} traded today` : "no trades today")
      : holdingBack.key === "holders" ? `${count(v.market.holder ?? 0)} holders`
      : "fill quality";
    return `Sound structure; held back by the market — ${fact}.`;
  }
  const label = redemptionLabel(v);
  return `${label[0].toUpperCase()}${label.slice(1)}, with ${liq} of depth.`;
}

function movement(trend?: TrendSummary | null): string | null {
  if (!trend || trend.days < 2) return null;
  if (trend.flat) return `Nothing has moved in ${trend.days} days of daily checks.`;
  if (trend.lostRoutability) return `Stopped being tradable within the last ${trend.days} days.`;
  if (trend.gradeChanged && trend.scoreFrom != null && trend.scoreTo != null) {
    return `Grade changed over ${trend.days} days: ${trend.scoreFrom} → ${trend.scoreTo}.`;
  }
  if (trend.direction === "flat" || trend.scoreChange == null) return `Steady over ${trend.days} days of daily checks.`;
  return `${trend.direction === "up" ? "Up" : "Down"} ${Math.abs(trend.scoreChange)} points over ${trend.days} days.`;
}

/**
 * Everything the "why" surfaces need for one token. Pure — no I/O — so it runs anywhere a scored
 * variant exists and can be tested against fixtures.
 */
export function explain(
  v: TxzVariant,
  s: TrovaScore,
  ctx: ScoreContext = {},
  opts: { trend?: TrendSummary | null; corporateAction?: CorporateAction | null } = {},
): Explanation {
  const all = drivers(v, s, opts.trend);
  const ranked = [...all].sort((a, b) => leverage(b, s) - leverage(a, s));
  const top = ranked[0];
  const holdingBack = top && (top.pillar === "cap" || leverage(top, s) >= 1) ? top : null;

  return {
    headline: headline(v, s, holdingBack),
    holdingBack,
    drivers: ranked,
    scenarios: s.hidden ? [] : scenarios(v, s, ctx),
    inputs: reportedInputs(v, ctx),
    benefits: benefits(s, v, opts.corporateAction),
    movement: movement(opts.trend),
  };
}
