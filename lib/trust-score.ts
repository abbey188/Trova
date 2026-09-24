// The Trova Score v3.1 — classify the instrument, then two pillars users can read
// separately, plus a combined score.
//
//   Instrument     What the token legally is (direct share claim … pre-IPO SPV exposure).
//                  Classified first; the class sets the product-rights part of Ownership.
//   Ownership      "What do I actually own?"  redemption right + product rights
//   Market health  "Can I get in and out?"    liquidity, activity, holders, execution
//   Trova Score    geometric mean of the two, so a strong pillar can't hide a weak one
//
// No instrument class is capped: every grade comes from the rubric, so a token whose
// ownership improves (e.g. gains a redemption path) scores higher. Only tokens.xyz
// advisories hard-cap. Scores near a grade cutoff are marked borderline.
//
// Method follows rating / composite-indicator practice ("not rated", borderline signals;
// OECD/JRC Handbook): classify before scoring, merge indicators that measure the
// same thing (liquidity/volume/trades/holders correlate 0.7–0.96), non-compensatory aggregation,
// fixed calibration, sensitivity-checked. Calibrated on live tokens.xyz variants, 2026-09-15.
//
// Rules: tier is a neutral label, never scored. Price, price gaps and private-valuation
// premiums are display-only, never scored. Speculative instruments are always labelled.
// Scores update as more information becomes public. Pure functions, server-side.

import type {
  Confidence, Grade, InstrumentClass, InstrumentInfo, ExitComponents, PillarScore, Rating,
  ScoreFlag, StockVariantTier, OwnershipComponents, Tier, TrovaScore, TxzCanonicalMarket, TxzVariant,
} from "./types";

export const METHOD_VERSION = "v3.2-2026-09-15";

export const MIN_LIQUIDITY_USD = 50_000;   // below this a trade would move the price too much to route
export const CLOSE_CALL_MARGIN = 5;        // best vs runner-up within this → show both, no winner
export const HIGH_BOT_SHARE = 0.8;         // factual flag only, not scored
export const SHORT_HISTORY_DAYS = 7;       // fewer days of snapshots → "short history" label
export const BORDERLINE_MARGIN = 3;        // within this many points of a grade cutoff → borderline
export const GRADE_CUTOFFS = { A: 80, B: 65, C: 50 } as const;

// Calibration anchors: rounded empirical quantiles (p10, p25, p50, p75, p90, max) of the
// 99 tradable variants (liquidity ≥ $50k, traded in 24h) on 2026-09-15, plus a floor.
// A value's score = where it sits among tradable tokenized assets (50 = median).
// Fixed rather than recomputed live, so a variant's score only moves when IT changes —
// required for tracking change over time. Recalibrate via scripts/score-diagnostics.
type Anchors = readonly (readonly [value: number, score: number])[];
const ANCHORS = {
  liquidityUsd: [[10_000, 0], [100_000, 10], [140_000, 25], [300_000, 50], [900_000, 75], [2_000_000, 90], [10_000_000, 100]],
  holders: [[10, 0], [70, 10], [400, 25], [2_000, 50], [9_000, 75], [25_000, 90], [100_000, 100]],
  trades24h: [[1, 0], [5, 10], [40, 25], [2_500, 50], [12_500, 75], [32_000, 90], [150_000, 100]],
  volume24hUsd: [[100, 0], [200, 10], [5_000, 25], [150_000, 50], [1_200_000, 75], [2_500_000, 90], [25_000_000, 100]],
} as const satisfies Record<string, Anchors>;

// Provider-documented redemption path (tokens.xyz stockVariantTier). Unreported is the
// neutral midpoint and lowers confidence — missing data is uncertainty, not risk.
const REDEMPTION: Record<StockVariantTier, number> = {
  share_redeemable: 100,
  cash_redeemable: 75,
  not_redeemable: 30,
};
const REDEMPTION_UNREPORTED = 50;

// Missing-data rule (v3.2): when redemption isn't reported, use the most conservative value reported
// by instruments of the same class — missing disclosure must never beat an explicit answer. Classes
// with no reporting peers get the neutral midpoint (and lower confidence). Calibrated 2026-09-15:
// 10 of 10 pre-IPO variants that report redemption report not_redeemable.
const REDEMPTION_CLASS_PEERS: Partial<Record<InstrumentClass, { tier: StockVariantTier; peers: string }>> = {
  "pre-ipo-exposure": { tier: "not_redeemable", peers: "pre-IPO tokens" },
};
const TIER_WORDS: Record<StockVariantTier, string> = {
  share_redeemable: "share-redeemable",
  cash_redeemable: "cash-redeemable",
  not_redeemable: "not redeemable",
};
const STRUCTURE_WEIGHTS = { redemption: 0.7, product: 0.3 } as const;

// Product rights by instrument class (rubric score, not a cap): full economic exposure 100;
// daily-reset leveraged 40; SPV economic exposure the issuer says confers no ownership,
// voting, dividend or information rights 0.
const PRODUCT_RIGHTS: Record<InstrumentClass, number> = {
  "direct-share": 100,
  "backed-tracker": 100,
  "non-redeemable-listed": 100,
  unreported: 100,
  leveraged: 40,
  "pre-ipo-exposure": 0,
};

const ADVISORY_CAP = { caution: 50, compromised: 15, blocked: 0 } as const;

const UPDATES_NOTE = "This rating updates as more information becomes public.";

/** Single source of truth for instrument copy shown in the UI. Factual, never predictive. */
export const INSTRUMENT_INFO: Record<InstrumentClass, Omit<InstrumentInfo, "class">> = {
  "direct-share": {
    label: "Share-redeemable",
    summary: "Issuer documentation indicates redemption into the underlying share.",
    speculative: false,
  },
  "backed-tracker": {
    label: "Cash-redeemable tracker",
    summary: "Issuer documentation indicates redemption for cash or the underlying's value — not the share itself.",
    speculative: false,
  },
  "non-redeemable-listed": {
    label: "No redemption path",
    summary: "No verified redemption path is reported for this token.",
    speculative: false,
  },
  unreported: {
    label: "Redemption not reported",
    summary: "Our data sources don't report a redemption path for this token.",
    speculative: false,
  },
  leveraged: {
    label: "Leveraged product",
    summary: "Daily-reset leveraged exposure — returns over longer periods can differ sharply from the underlying.",
    speculative: false,
  },
  "pre-ipo-exposure": {
    label: "Speculative · pre-IPO exposure",
    summary:
      "Economic exposure to a private company through an SPV. The issuer states it confers no ownership, voting, " +
      "dividend or information rights and may result in total loss. Priced against private valuation marks, " +
      `not a public market. Speculative at best. ${UPDATES_NOTE}`,
    speculative: true,
  },
};

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
const round = Math.round;

/** Piecewise log-linear interpolation between calibration anchors. */
function anchored(value: number | undefined, anchors: Anchors): number {
  if (!value || value <= anchors[0][0]) return 0;
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return 100;
  for (let i = 1; i < anchors.length; i++) {
    const [v1, s1] = anchors[i];
    if (value <= v1) {
      const [v0, s0] = anchors[i - 1];
      const t = (Math.log10(value) - Math.log10(v0)) / (Math.log10(v1) - Math.log10(v0));
      return s0 + t * (s1 - s0);
    }
  }
  return 100;
}

export function gradeOf(score: number): Grade {
  return score >= GRADE_CUTOFFS.A ? "A" : score >= GRADE_CUTOFFS.B ? "B" : score >= GRADE_CUTOFFS.C ? "C" : "D";
}

const CUTOFF_BANDS: readonly [upper: Grade, lower: Grade, cutoff: number][] = [
  ["A", "B", GRADE_CUTOFFS.A],
  ["B", "C", GRADE_CUTOFFS.B],
  ["C", "D", GRADE_CUTOFFS.C],
];

/** Borderline when within BORDERLINE_MARGIN of a cutoff; names the grade it sits next to. */
export function borderlineOf(score: number): { cutoff: number; adjacentGrade: Grade } | null {
  for (const [upper, lower, cutoff] of CUTOFF_BANDS) {
    if (Math.abs(score - cutoff) <= BORDERLINE_MARGIN) {
      return { cutoff, adjacentGrade: score >= cutoff ? lower : upper };
    }
  }
  return null;
}

function tierOf(v: TxzVariant): Tier {
  return v.liquidityTier ?? v.trustTier ?? "tier3"; // trustTier is a deprecated alias
}

export interface ScoreContext {
  /** Issuer independently confirmed, e.g. the mint appears in Backpack's own asset list. */
  issuerConfirmed?: boolean;
  /** tokens.xyz asset id; "pre-*" ids are pre-IPO assets. */
  assetId?: string;
  /** tokens.xyz asset canonicalMarket.source; "prestocks" = priced against private marks. */
  canonicalSource?: string;
  /** Days of Trova snapshots behind this variant. */
  historyDays?: number;
}

// PreStocks / Tessera are SPV-exposure issuers. Tessera's convention is name "T-<Company>" AND
// symbol "t<Company>" (T-OpenAI / tOpenAI) — both required, since listed names like
// "T-Mobile US" (TMUSon, TMUSx) also start with "T-".
const PRE_IPO_ISSUER = /\b(prestocks|tessera)\b/i;
const TESSERA_NAME = /^T-[A-Z]/;
const TESSERA_SYMBOL = /^t[A-Z]/;

function isPreIpoExposure(v: TxzVariant, ctx: ScoreContext): boolean {
  if (ctx.canonicalSource === "prestocks" || ctx.assetId?.startsWith("pre-")) return true;
  if (TESSERA_NAME.test(v.name) && TESSERA_SYMBOL.test(v.symbol)) return true;
  return PRE_IPO_ISSUER.test([v.issuer, v.label, v.name, ...(v.tags ?? [])].filter(Boolean).join(" "));
}

/** Classify what the token legally is — done before any scoring. */
export function classifyInstrument(v: TxzVariant, ctx: ScoreContext = {}): InstrumentInfo {
  let cls: InstrumentClass;
  if (isPreIpoExposure(v, ctx)) cls = "pre-ipo-exposure";
  else if (v.kind === "leveraged") cls = "leveraged";
  else if (v.stockVariantTier === "share_redeemable") cls = "direct-share";
  else if (v.stockVariantTier === "cash_redeemable") cls = "backed-tracker";
  else if (v.stockVariantTier === "not_redeemable") cls = "non-redeemable-listed";
  else cls = "unreported";

  const info: InstrumentInfo = { class: cls, ...INSTRUMENT_INFO[cls] };
  return info;
}

function ownershipPillar(v: TxzVariant, instrument: InstrumentInfo): PillarScore<OwnershipComponents> {
  const redemptionReported = v.stockVariantTier != null;
  const peers = REDEMPTION_CLASS_PEERS[instrument.class];
  const components: OwnershipComponents = {
    redemption: redemptionReported ? REDEMPTION[v.stockVariantTier!] : peers ? REDEMPTION[peers.tier] : REDEMPTION_UNREPORTED,
    redemptionReported,
    redemptionBasis: redemptionReported ? "reported" : peers ? "class-peers" : "neutral",
    product: PRODUCT_RIGHTS[instrument.class],
  };
  const score = round(components.redemption * STRUCTURE_WEIGHTS.redemption + components.product * STRUCTURE_WEIGHTS.product);
  return { score, grade: gradeOf(score), components };
}

function exitPillar(v: TxzVariant): PillarScore<ExitComponents> {
  const m = v.market;
  const exec = v.executionQuality?.executionScore;
  const components: ExitComponents = {
    liquidity: round(anchored(m.liquidity, ANCHORS.liquidityUsd)),
    // trades and volume correlate 0.96 → one indicator, not two
    activity: round((anchored(m.trade24h, ANCHORS.trades24h) + anchored(m.volume24hUSD, ANCHORS.volume24hUsd)) / 2),
    holders: round(anchored(m.holder, ANCHORS.holders)),
    execution: exec == null ? null : round(clamp(exec)),
  };
  const parts = [components.liquidity, components.activity, components.holders];
  if (components.execution != null) parts.push(components.execution);
  const score = round(parts.reduce((s, x) => s + x, 0) / parts.length);
  return { score, grade: gradeOf(score), components };
}

/**
 * The five inputs confidence is counted from, each with whether this token reports it. Exported so
 * the rating page can say "4 of 5 reported" and name the missing one from the same list the score
 * uses — never from a second copy that could drift.
 */
export function reportedInputs(v: TxzVariant, ctx: ScoreContext = {}): { key: string; label: string; reported: boolean }[] {
  const issuerConfirmed = ctx.issuerConfirmed === true || Boolean(v.issuer && v.issuerUrl);
  return [
    { key: "redemption", label: "Redemption terms", reported: v.stockVariantTier != null },
    { key: "issuer", label: "Issuer", reported: Boolean(v.issuer || v.label) || issuerConfirmed },
    { key: "execution", label: "Fill quality", reported: v.executionQuality != null },
    { key: "holders", label: "Holder count", reported: (v.market.holder ?? 0) > 0 },
    { key: "trades", label: "Trades in the last 24h", reported: (v.market.trade24h ?? 0) > 0 },
  ];
}

export function scoreVariant(v: TxzVariant, ctx: ScoreContext = {}): TrovaScore {
  const instrument = classifyInstrument(v, ctx);
  const ownership = ownershipPillar(v, instrument);
  const exit = exitPillar(v);
  const advisory = v.advisory ?? null;
  const status = advisory?.status;

  const liquidityUsd = v.market.liquidity ?? 0;
  const traded24h = (v.market.trade24h ?? 0) > 0;
  const issuerNamed = Boolean(v.issuer || v.label);
  const issuerConfirmed = ctx.issuerConfirmed === true || Boolean(v.issuer && v.issuerUrl);

  // Confidence = share of key inputs actually reported (missing data ≠ risk, but less certainty).
  const reported = reportedInputs(v, ctx).filter((i) => i.reported).length;
  const confidence: Confidence = reported >= 4 ? "high" : reported === 3 ? "medium" : "low";

  // Not rated: no redemption path reported, no trading, and almost nothing else reported.
  const rated = !(!ownership.components.redemptionReported && !traded24h && reported <= 1);
  const notRatedReason = rated ? undefined : "Not rated — too little reported data to score honestly";

  // Equal-weight geometric mean: non-compensatory, so e.g. perfect redemption can't mask no liquidity.
  let raw = Math.sqrt(Math.max(ownership.score, 1) * Math.max(exit.score, 1));
  if (status) {
    raw = Math.min(raw, ADVISORY_CAP[status]);
    ownership.score = Math.min(ownership.score, ADVISORY_CAP[status]);
    ownership.grade = gradeOf(ownership.score);
  }
  const score = rated ? round(raw) : null;
  const grade: Rating = score == null ? "NR" : gradeOf(score);
  const borderline = score == null ? null : borderlineOf(score);

  const flags: ScoreFlag[] = [];
  if (status) flags.push(`advisory-${status}`);
  if (instrument.class === "pre-ipo-exposure") flags.push("pre-ipo-exposure");
  if (instrument.speculative) flags.push("speculative");
  if (v.stockVariantTier === "not_redeemable") flags.push("not-redeemable");
  if (!ownership.components.redemptionReported) flags.push("redemption-unreported");
  if (v.kind === "leveraged") flags.push("leveraged");
  if (liquidityUsd < MIN_LIQUIDITY_USD) flags.push("thin-liquidity");
  if (!traded24h) flags.push("no-recent-trades");
  if ((v.executionQuality?.botVolumeRatio ?? 0) >= HIGH_BOT_SHARE) flags.push("high-bot-share");
  if (!issuerNamed) flags.push("issuer-unnamed");
  if (!rated) flags.push("not-rated");
  if (borderline) flags.push("borderline");
  if ((ctx.historyDays ?? 0) < SHORT_HISTORY_DAYS) flags.push("short-history");

  const notRoutableReason =
    status === "blocked" ? "Blocked by a tokens.xyz advisory"
    : status === "compromised" ? `Advisory: ${advisory?.reason ?? "marked compromised"}`
    : !rated ? notRatedReason
    : liquidityUsd < MIN_LIQUIDITY_USD ? "Liquidity under $50k — a trade would move the price"
    : !traded24h ? "No trades in the last 24 hours"
    : undefined;

  return {
    score,
    grade,
    borderline,
    rated,
    notRatedReason,
    instrument,
    confidence,
    ownership,
    exit,
    tier: tierOf(v),
    advisory,
    routable: !notRoutableReason,
    notRoutableReason,
    hidden: status === "blocked",
    issuerConfirmed,
    isPrimary: v.executionQuality?.isEligibleForPrimary === true,
    flags,
    methodVersion: METHOD_VERSION,
  };
}

export interface RankedVariant { variant: TxzVariant; score: TrovaScore }

/** Rank an asset's variants: routable first, then rated, combined score, Ownership, tokens.xyz primary. */
export function rankVariants(
  variants: TxzVariant[],
  ctxFor: (v: TxzVariant) => ScoreContext = () => ({}),
): RankedVariant[] {
  return variants
    .map((variant) => ({ variant, score: scoreVariant(variant, ctxFor(variant)) }))
    .sort((a, b) =>
      Number(b.score.routable) - Number(a.score.routable)
      || (b.score.score ?? -1) - (a.score.score ?? -1)
      || b.score.ownership.score - a.score.ownership.score
      || Number(b.score.isPrimary) - Number(a.score.isPrimary));
}

/** The best routable, rated variant, and whether it's a close call against the runner-up. */
export function pickBest(ranked: RankedVariant[]): { best: RankedVariant | null; runnerUp: RankedVariant | null; closeCall: boolean } {
  const eligible = ranked.filter((r) => r.score.routable && r.score.rated && !r.score.hidden);
  const [best = null, runnerUp = null] = eligible;
  const closeCall = !!best && !!runnerUp && best.score.score! - runnerUp.score.score! < CLOSE_CALL_MARGIN;
  return { best, runnerUp, closeCall };
}

/** A holding needs attention if it can't be traded, isn't rated, grades D, or carries an advisory. */
export function needsAttention(s: TrovaScore): boolean {
  return !s.routable || !s.rated || s.grade === "D" || s.advisory != null;
}

/** Value-weighted portfolio scores (rated holdings only), value needing attention, and speculative value. */
export function portfolioScores(items: { valueUsd: number; score: TrovaScore }[]) {
  const rated = items.filter((i) => i.score.score != null);
  const total = rated.reduce((s, i) => s + i.valueUsd, 0);
  const avg = (pick: (s: TrovaScore) => number) =>
    total <= 0 ? 0 : round(rated.reduce((s, i) => s + i.valueUsd * pick(i.score), 0) / total);
  const sum = (pred: (s: TrovaScore) => boolean) => items.filter((i) => pred(i.score)).reduce((s, i) => s + i.valueUsd, 0);
  return {
    overall: avg((s) => s.score!),
    ownership: avg((s) => s.ownership.score),
    exit: avg((s) => s.exit.score),
    needsAttentionUsd: sum(needsAttention),
    speculativeUsd: sum((s) => s.instrument.speculative),
  };
}

/** Plain-language note on how redemption was scored when it wasn't reported (null when reported). */
export function redemptionNote(s: TrovaScore): string | null {
  const basis = s.ownership.components.redemptionBasis;
  if (basis === "class-peers") {
    const peers = REDEMPTION_CLASS_PEERS[s.instrument.class]!;
    return `Redemption not reported — treated as ${TIER_WORDS[peers.tier]}, the most conservative value reported by other ${peers.peers}.`;
  }
  if (basis === "neutral") return "Redemption not reported — scored neutrally, with lower confidence.";
  return null;
}

/** Pre-IPO pricing facts for display only (never scored): last private mark vs token-implied valuation. */
export function privateMarkFacts(cm?: TxzCanonicalMarket | null) {
  if (cm?.source !== "prestocks" || cm.markValuationUsd == null) return null;
  return {
    markValuationUsd: cm.markValuationUsd,
    impliedValuationUsd: cm.impliedValuationUsd ?? null,
    premiumToMarkPercent: cm.premiumToMarkPercent ?? null,
    asOf: cm.asOf ?? null,
  };
}
