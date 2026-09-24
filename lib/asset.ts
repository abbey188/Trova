// Asset detail — every variant of one asset, ranked and explained: the safety report behind
// "which one should I hold?". Read-only. Price data is display-only and never scored.

import { getBackpackIssuedMints, getExternalKlines, getExternalTickers, getSecurities, type BpKline } from "./backpack";
import { getVariantHistory } from "./history";
import { exitLadder } from "./jupiter";
import { getScaledUiAmounts } from "./token-extensions";
import { equityFeed, getPythPrices } from "./pyth";
import { getChangeSignals } from "./signals";
import { getAsset, getOhlcv, getRiskSummary, getVariants, resolveIssuer, type TxzOhlcv, type TxzRiskSummary } from "./tokens-xyz";
import {
  METHOD_VERSION, pickBest, privateMarkFacts, rankVariants, redemptionNote,
  type ScoreContext,
} from "./trust-score";
import { getCuratedUniverse } from "./universe";
import type { Asset, AssetDetail, AssetVariantView, Candle, ExternalRating, PriceBasis, PriceHistory, PriceReference, TrovaScore, TxzVariant, Variant } from "./types";

/** Per-ounce metal feeds. Spot metal tokens (PAXG, XAUt0…) are one troy ounce; ETF-tracker tokens
 *  (GLDx, IAUon) follow a per-share ETF instead and get no reference. */
const METAL_FEEDS: Record<string, string> = { gold: "Metal.XAU/USD", silver: "Metal.XAG/USD" };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** tokens.xyz 404s unknown ids — that means "no such asset" (→ 404), not an outage (→ 502). */
async function variantsOrNone(assetId: string): Promise<TxzVariant[]> {
  try {
    return await getVariants(assetId);
  } catch (e) {
    if (/\b404\b/.test(message(e))) return [];
    throw e;
  }
}

/** Percentage difference between a variant's on-chain price and the real-world reference. */
export function gapPercent(variantPriceUsd: number, referenceUsd: number): number | null {
  if (!(variantPriceUsd > 0) || !(referenceUsd > 0)) return null;
  return Math.round((variantPriceUsd / referenceUsd - 1) * 10_000) / 100;
}

/**
 * A price gap is only meaningful when the token tracks exactly one unit of the reference.
 * Mixing per-ounce tokens with per-share ETFs once produced a 994% "gap", and pre-IPO SPV exposure
 * isn't a claim on the listed share at all, so both are excluded.
 */
export function comparable(
  assetClass: Asset["assetClass"],
  variantKind: string,
  score: TrovaScore,
  basis: PriceBasis,
): boolean {
  if (score.instrument.speculative) return false;
  if (assetClass === "stock" || assetClass === "etf") return basis === "share";
  if (assetClass === "metal") return basis === "ounce" && variantKind === "spot";
  return false;
}

function variantView(v: TxzVariant, score: TrovaScore, assetId: string, backpackIssued: boolean): Variant {
  const volume = v.market.volume24hUSD ?? 0;
  const bot = v.executionQuality?.botVolumeRatio;
  return {
    variantId: v.variantId,
    mint: v.mint,
    assetId,
    kind: v.kind,
    issuer: backpackIssued ? "Backpack Securities" : resolveIssuer(v),
    symbol: v.symbol,
    name: v.name,
    tier: score.tier,
    stockVariantTier: v.stockVariantTier ?? null,
    priceUsd: v.market.price,
    liquidityUsd: v.market.liquidity ?? 0,
    volume24hUsd: volume,
    organicVolume24hUsd: bot == null ? volume : volume * (1 - bot),
    botVolumeRatio: bot,
    executionScore: v.executionQuality?.executionScore,
    holders: v.market.holder,
    logoURI: v.market.logoURI,
    score,
  };
}

/** Everything the asset page needs, or null when tokens.xyz knows nothing about the id. */
export async function buildAssetDetail(assetId: string): Promise<AssetDetail | null> {
  const warnings: string[] = [];
  const soft = <T>(label: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => { warnings.push(`${label} unavailable: ${message(e)}`); return null; });
  const universeErrors: { scope: string; error: string }[] = [];

  const [asset, variants, universe, securities, backpackMints] = await Promise.all([
    soft("Asset detail", getAsset(assetId)),
    variantsOrNone(assetId),
    getCuratedUniverse(universeErrors),
    soft("Backpack securities list", getSecurities()),
    soft("Backpack issuer list", getBackpackIssuedMints()),
  ]);
  for (const e of universeErrors) warnings.push(`${e.scope} unavailable: ${e.error}`);
  if (!asset && !variants.length) return null;

  const entry = universe.get(assetId);
  const assetInfo: Asset = {
    assetId,
    name: asset?.name ?? entry?.asset.name ?? assetId,
    symbol: asset?.symbol ?? entry?.asset.symbol ?? "",
    assetClass: entry?.assetClass ?? (asset?.category === "commodity" ? "metal" : asset?.category === "rwa" ? "rwa" : "other"),
  };
  const ticker = assetInfo.symbol.toUpperCase();
  const quotedByBackpack = securities?.has(ticker) ?? false; // Backpack quotes this ticker — not proof the company is listed
  const shareFeed = (assetInfo.assetClass === "stock" || assetInfo.assetClass === "etf") && ticker ? equityFeed(ticker) : null;
  const metalFeed = assetInfo.assetClass === "metal" ? METAL_FEEDS[assetId] ?? null : null;
  const feedSymbol = shareFeed ?? metalFeed;
  const basis: PriceBasis = metalFeed ? "ounce" : "share";

  const [pyth, externalTickers, change, history, risk, ohlcv, klines] = await Promise.all([
    feedSymbol ? soft("Pyth prices", getPythPrices([feedSymbol])) : Promise.resolve(null),
    shareFeed && quotedByBackpack ? soft("Backpack reference prices", getExternalTickers()) : Promise.resolve(null),
    variants.length ? soft("Change history", getChangeSignals({ mints: variants.map((v) => v.mint), days: 30 })) : Promise.resolve(null),
    variants.length ? soft("Rating history", getVariantHistory(variants.map((v) => v.mint), 30)) : Promise.resolve(null),
    soft("Market risk rating", getRiskSummary(assetId)),
    soft("Price history", getOhlcv(assetId, "1D", Date.now() / 1000 - HISTORY_DAYS * 86_400, Date.now() / 1000)),
    shareFeed && quotedByBackpack
      ? soft("Reference price history", getExternalKlines(ticker, "1d", Math.floor(Date.now() / 1000) - HISTORY_DAYS * 86_400))
      : Promise.resolve(null),
  ]);

  const pythPrice = feedSymbol ? pyth?.get(feedSymbol) : undefined;
  const backpackPrice = Number(externalTickers?.get(ticker)?.lastPrice ?? Number.NaN);
  const referenceTicker = metalFeed ? metalFeed.replace("Metal.", "").replace("/USD", "") : ticker;
  const reference: PriceReference | null = pythPrice
    ? {
        ticker: referenceTicker, priceUsd: pythPrice.priceUsd, source: "pyth", basis,
        confUsd: pythPrice.confUsd, ageSec: pythPrice.ageSec,
        marketOpen: pythPrice.marketOpen ?? null, feedSymbol: pythPrice.symbol,
      }
    : shareFeed && Number.isFinite(backpackPrice)
      ? { ticker, priceUsd: backpackPrice, source: "backpack", basis: "share", confUsd: null, ageSec: null, marketOpen: null, feedSymbol: null }
      : null;

  const historyDays = change?.historyDays ?? 0;
  const ctxFor = (v: TxzVariant): ScoreContext => ({
    assetId,
    canonicalSource: asset?.canonicalMarket?.source,
    issuerConfirmed: backpackMints?.has(v.mint),
    historyDays,
  });

  const ranked = rankVariants(variants, ctxFor);
  const { best, runnerUp, closeCall } = pickBest(ranked);

  const views: AssetVariantView[] = ranked.map(({ variant, score }) => {
    const view = variantView(variant, score, assetId, backpackMints?.has(variant.mint) ?? false);
    const gap = reference && comparable(assetInfo.assetClass, variant.kind, score, reference.basis)
      ? gapPercent(view.priceUsd, reference.priceUsd)
      : null;
    return {
      ...view,
      isBest: best?.variant.mint === variant.mint,
      history: history?.get(variant.mint) ?? null,
      gapPercent: gap,
      redemptionNote: redemptionNote(score),
    };
  });

  // A split or distribution the issuer scheduled on the mint itself (Token-2022 scaled UI amount).
  // Optional context: if the lookup fails the page still renders, just without it.
  try {
    const scaled = await getScaledUiAmounts(views.map((v) => v.mint));
    for (const v of views) {
      const s = scaled.get(v.mint);
      v.corporateAction = s
        ? { multiplier: s.multiplier, newMultiplier: s.newMultiplier, effectiveAt: s.effectiveAt, pending: s.pending }
        : null;
    }
  } catch {
    warnings.push("Corporate actions unavailable for this asset.");
  }

  // What it costs to get in and back out of the best variant, at three sizes — measured, not modelled.
  if (best) {
    try {
      const ladder = await exitLadder(best.variant.mint);
      const view = views.find((v) => v.mint === best.variant.mint);
      if (view) {
        view.exitLadder = ladder.map((l) => ({
          status: l.status, roundTripPct: l.roundTripPct, routable: l.routable, usdSize: l.usdSize, routeLabels: l.routeLabels,
        }));
      }
    } catch {
      warnings.push("Exit cost unavailable right now.");
    }
  }

  return {
    asset: { ...assetInfo, cusip: securities?.get(ticker)?.cusip ?? null },
    asOf: Date.now(),
    methodVersion: METHOD_VERSION,
    stats: asset?.stats
      ? {
          priceUsd: asset.stats.price ?? null,
          liquidityUsd: asset.stats.liquidity ?? null,
          volume24hUsd: asset.stats.volume24hUSD ?? null,
          volume30dUsd: asset.stats.volume30dUSD ?? null,
          marketCapUsd: asset.stats.marketCap ?? null,
          priceChange24hPercent: asset.stats.priceChange24hPercent ?? null,
          holders: asset.stats.holder ?? null,
        }
      : null,
    reference,
    privateMark: privateMarkFacts(asset?.canonicalMarket),
    variants: views,
    best: best ? { mint: best.variant.mint, symbol: best.variant.symbol, closeCall, runnerUpMint: runnerUp?.variant.mint ?? null } : null,
    externalRating: externalRating(risk),
    priceHistory: priceHistory(ohlcv?.candles, klines, ticker, reference),
    signals: change?.signals ?? [],
    historyDays,
    warnings,
  };
}

/** How many days of price history the asset page charts. */
const HISTORY_DAYS = 90;

/**
 * tokens.xyz's market risk score, normalised for display beside ours.
 *
 * Each component is tagged with what it actually measures. All four of theirs are market metrics —
 * that is not a criticism of their score, it is the reason two tokens with completely different
 * rights can come back identical, and the reason Trova adds a pillar rather than a tiebreak.
 */
function externalRating(risk: TxzRiskSummary | null | undefined): ExternalRating | null {
  const m = risk?.risk?.marketScore;
  if (!m) return null;
  return {
    source: "tokens.xyz",
    score: m.score ?? null,
    grade: m.grade ?? null,
    label: m.label ?? null,
    tone: m.tone ?? null,
    components: Object.entries(m.components ?? {}).map(([key, c]) => ({
      key,
      score: c?.score ?? null,
      status: c?.status ?? null,
      measures: "market" as const,   // every component they publish is a market metric
    })),
    insufficientData: m.hasInsufficientData ?? false,
    updatedAt: risk?.risk?.lastUpdatedAt ?? null,
  };
}

/**
 * Price history for the chart: the token's own candles, plus the real stock's closes when the two
 * are comparable 1:1. They are kept as separate series on purpose — a dead variant quoting a stale
 * last trade against a live stock price is a fact worth seeing, not one to average away.
 */
function priceHistory(
  candles: TxzOhlcv["candles"] | undefined,
  klines: BpKline[] | null | undefined,
  ticker: string,
  reference: PriceReference | null,
): PriceHistory | null {
  const token: Candle[] = (candles ?? [])
    .filter((c) => Number.isFinite(c.close))
    .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));

  // Only chart the real stock alongside when the reference is per-share — never a per-ounce metal.
  const closes = reference?.basis === "share" && klines?.length
    ? klines
        .map((k) => ({ time: Math.floor(Date.parse(`${k.start.replace(" ", "T")}Z`) / 1000), close: Number(k.close) }))
        .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.close))
    : [];

  if (token.length === 0 && closes.length === 0) return null;
  return { interval: "1D", token, reference: closes.length ? { ticker, closes } : null };
}
