// The Trova Score — our algorithm layered on tokens.xyz's raw fields.
// Pure functions, server-side. Validated against real solana + tesla payloads.

import type {
  TxzVariant, Tier, TrovaScore, ScoreComponents, StockVariantTier,
} from "./types";

// Tier is a hard CAP, never just a weight. Crypto can reach tier1; tokenized
// stocks currently top out at tier2, so ranking is relative within an asset.
const TIER_CAP: Record<Tier, number> = { tier1: 100, tier2: 80, tier3: 45 };

const W = { liquidity: 0.35, execution: 0.30, redeemability: 0.20, maturity: 0.15 };

// Tunable floors/thresholds
export const MIN_LIQUIDITY_USD = 50_000;   // below this a variant is not one-tap routable
export const SAFE_SCORE_THRESHOLD = 60;    // holdings below this count toward "at risk"

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

/** Liquidity 0..100 on a log scale: ~$10k→low, ~$1M→~70, ~$10M+→~100. */
function liquidityScore(liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 0;
  const s = (Math.log10(liquidityUsd) - 4) * 28; // 10^4=$10k → 0 ; 10^7=$10M → ~84
  return clamp(s);
}

/** Execution 0..100: tokens.xyz executionScore, penalized by bot-volume share. */
function executionScore(v: TxzVariant): number {
  const eq = v.executionQuality;
  if (!eq) return 40; // unknown execution quality = mediocre, not zero
  const base = clamp(eq.executionScore ?? 40);
  const botPenalty = eq.botVolumeRatio != null ? eq.botVolumeRatio * 25 : 0; // up to -25
  return clamp(base - botPenalty);
}

function redeemabilityScore(t?: StockVariantTier | null): number {
  switch (t) {
    case "share_redeemable": return 100;
    case "cash_redeemable": return 75;
    case "not_redeemable": return 40;
    default: return 60; // unknown/non-stock
  }
}

/** Maturity 0..100 from holder count + trading activity. */
function maturityScore(v: TxzVariant): number {
  const holders = v.market.holder ?? 0;
  const trades = v.market.trade24h ?? 0;
  const hScore = holders <= 0 ? 0 : clamp((Math.log10(holders) - 1) * 33); // 10→0, 10k→~99
  const tScore = trades <= 0 ? 0 : clamp((Math.log10(trades)) * 25);       // 1→0, 10k→~100
  return clamp(0.6 * hScore + 0.4 * tScore);
}

function tierOf(v: TxzVariant): Tier {
  // liquidityTier is current; trustTier is a deprecated alias; default tier3.
  return (v.liquidityTier ?? v.trustTier ?? "tier3");
}

export function scoreVariant(v: TxzVariant): TrovaScore {
  const tier = tierOf(v);
  const components: ScoreComponents = {
    liquidity: liquidityScore(v.market.liquidity ?? 0),
    execution: executionScore(v),
    redeemability: redeemabilityScore(v.stockVariantTier),
    maturity: maturityScore(v),
  };
  const raw =
    components.liquidity * W.liquidity +
    components.execution * W.execution +
    components.redeemability * W.redeemability +
    components.maturity * W.maturity;

  const tierCap = TIER_CAP[tier];
  const score = Math.round(Math.min(raw, tierCap));

  const flags: string[] = [];
  const botRatio = v.executionQuality?.botVolumeRatio;
  if (botRatio != null && botRatio >= 0.8) flags.push("bot-heavy");
  if ((v.market.liquidity ?? 0) < MIN_LIQUIDITY_USD) flags.push("thin-liquidity");
  if (v.stockVariantTier === "not_redeemable") flags.push("not-redeemable");
  if (tier === "tier3") flags.push("low-tier");

  const rejectReason =
    tier === "tier3" ? "Lowest trust tier — unverified/experimental"
    : (v.market.liquidity ?? 0) < MIN_LIQUIDITY_USD ? "Liquidity too thin to route safely"
    : undefined;

  return {
    score,
    tier,
    tierCap,
    components,
    routable: !rejectReason,
    isPrimary: v.executionQuality?.isEligibleForPrimary === true,
    rejectReason,
    flags,
  };
}

/** Rank an asset's variants: routable first, then by isPrimary, then score desc.
 *  variants[0] (if routable) is "Buy safest". */
export function rankVariants(variants: TxzVariant[]): { variant: TxzVariant; score: TrovaScore }[] {
  return variants
    .map((variant) => ({ variant, score: scoreVariant(variant) }))
    .sort((a, b) => {
      if (a.score.routable !== b.score.routable) return a.score.routable ? -1 : 1;
      if (a.score.isPrimary !== b.score.isPrimary) return a.score.isPrimary ? -1 : 1;
      return b.score.score - a.score.score;
    });
}

/** Value-weighted portfolio trust score (0..100). */
export function portfolioTrustScore(items: { valueUsd: number; score: number }[]): number {
  const total = items.reduce((s, i) => s + i.valueUsd, 0);
  if (total <= 0) return 0;
  return Math.round(items.reduce((s, i) => s + i.valueUsd * i.score, 0) / total);
}
