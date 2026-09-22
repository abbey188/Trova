// Asset detail — every variant of one asset, ranked and explained: the safety report behind
// "which one should I hold?". Read-only. Price data is display-only and never scored.

import { getBackpackIssuedMints, getExternalTickers, getSecurities } from "./backpack";
import { equityFeed, getPythPrices } from "./pyth";
import { getChangeSignals } from "./signals";
import { getAsset, getVariants, resolveIssuer } from "./tokens-xyz";
import {
  METHOD_VERSION, pickBest, privateMarkFacts, rankVariants, redemptionNote,
  type ScoreContext,
} from "./trust-score";
import { getCuratedUniverse } from "./universe";
import type { Asset, AssetDetail, AssetVariantView, PriceBasis, PriceReference, TrovaScore, TxzVariant, Variant } from "./types";

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
  const listed = securities?.has(ticker) ?? false;
  const shareFeed = (assetInfo.assetClass === "stock" || assetInfo.assetClass === "etf") && ticker ? equityFeed(ticker) : null;
  const metalFeed = assetInfo.assetClass === "metal" ? METAL_FEEDS[assetId] ?? null : null;
  const feedSymbol = shareFeed ?? metalFeed;
  const basis: PriceBasis = metalFeed ? "ounce" : "share";

  const [pyth, externalTickers, change] = await Promise.all([
    feedSymbol ? soft("Pyth prices", getPythPrices([feedSymbol])) : Promise.resolve(null),
    shareFeed && listed ? soft("Backpack reference prices", getExternalTickers()) : Promise.resolve(null),
    variants.length ? soft("Change history", getChangeSignals({ mints: variants.map((v) => v.mint), days: 30 })) : Promise.resolve(null),
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
    underlyingListed: securities ? listed : undefined,
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
      gapPercent: gap,
      redemptionNote: redemptionNote(score),
    };
  });

  return {
    asset: assetInfo,
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
    signals: change?.signals ?? [],
    historyDays,
    warnings,
  };
}
