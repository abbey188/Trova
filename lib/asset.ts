// Asset detail — every variant of one asset, ranked and explained: the safety report behind
// "which one should I hold?". Read-only. Price data is display-only and never scored.

import { getBackpackIssuedMints, getExternalKlines, getExternalTickers, getSecurities, type BpKline } from "./backpack";
import { explain } from "./explain";
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
export async function buildAssetDetail(
  assetId: string,
  { withExitLadder = false }: { withExitLadder?: boolean } = {},
): Promise<AssetDetail | null> {
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

  const nowSec = Math.floor(Date.now() / 1000);
  const yearAgo = nowSec - HISTORY_DAYS * 86_400;
  const dayAgo = nowSec - 86_400;
  const withReference = Boolean(shareFeed && quotedByBackpack);
  const [pyth, externalTickers, change, history, risk, daily, intraday, klinesDaily, klinesHourly] = await Promise.all([
    feedSymbol ? soft("Pyth prices", getPythPrices([feedSymbol])) : Promise.resolve(null),
    withReference ? soft("Backpack reference prices", getExternalTickers()) : Promise.resolve(null),
    variants.length ? soft("Change history", getChangeSignals({ mints: variants.map((v) => v.mint), days: 30 })) : Promise.resolve(null),
    variants.length ? soft("Rating history", getVariantHistory(variants.map((v) => v.mint), 30)) : Promise.resolve(null),
    soft("Market risk rating", getRiskSummary(assetId)),
    soft("Price history", getOhlcv(assetId, "1D", { from: yearAgo, to: nowSec })),
    soft("Intraday price", getOhlcv(assetId, "1H", { from: dayAgo, to: nowSec })),
    withReference ? soft("Reference price history", getExternalKlines(ticker, "1d", yearAgo)) : Promise.resolve(null),
    withReference ? soft("Reference intraday", getExternalKlines(ticker, "1h", dayAgo)) : Promise.resolve(null),
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

  // The chart must show the token we put first. tokens.xyz's primary can differ, and for a mixed
  // asset the difference is a unit: for "gold" it is a per-OUNCE spot token (~$4,300) while our best
  // is GLDx, a per-SHARE ETF tracker (~$394). Refetch by mint whenever the two disagree.
  let chartDaily = daily;
  let chartIntraday = intraday;
  if (best && daily?.mint && best.variant.mint !== daily.mint) {
    const [d, h] = await Promise.all([
      soft("Price history", getOhlcv(assetId, "1D", { from: yearAgo, to: nowSec, mint: best.variant.mint })),
      soft("Intraday price", getOhlcv(assetId, "1H", { from: dayAgo, to: nowSec, mint: best.variant.mint })),
    ]);
    if (d?.mint === best.variant.mint) {
      chartDaily = d;
      chartIntraday = h?.mint === best.variant.mint ? h : null;
    }
  }

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

  // Why each token is rated as it is, from its own inputs — after corporate actions are attached,
  // since a reinvested distribution is evidence for the benefits list.
  const rawByMint = new Map(ranked.map((r) => [r.variant.mint, r.variant]));
  for (const v of views) {
    const raw = rawByMint.get(v.mint);
    if (!raw) continue;
    v.explanation = explain(raw, v.score, ctxFor(raw), { trend: v.history?.trend ?? null, corporateAction: v.corporateAction ?? null });
  }

  // What it costs to get in and back out of the best variant, at three sizes — measured, not modelled.
  // Six sequential quotes under a 10-per-10s limit take seconds, so the page does not wait for them
  // by default: GET /api/exit serves the ladder on its own and the screen fills it in when it lands.
  if (best && withExitLadder) {
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
    priceHistory: priceHistory(chartDaily, chartIntraday, klinesDaily, klinesHourly, ticker, reference),
    about: aboutText(asset),
    tokenizedSupply: tokenizedSupply(variants),
    signals: change?.signals ?? [],
    historyDays,
    warnings,
  };
}

/** Days of price history the asset page fetches: the 1Y tab and a 52-week range. */
const HISTORY_DAYS = 365;

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

const toCandles = (candles: TxzOhlcv["candles"] | undefined): Candle[] =>
  (candles ?? [])
    .filter((c) => Number.isFinite(c.close))
    .map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));

const toCloses = (klines: BpKline[] | null | undefined) =>
  (klines ?? [])
    .map((k) => ({ time: Math.floor(Date.parse(`${k.start.replace(" ", "T")}Z`) / 1000), close: Number(k.close) }))
    .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.close) && k.close > 0);

function range(values: number[]): { low: number; high: number } | null {
  const v = values.filter((n) => Number.isFinite(n) && n > 0);
  return v.length ? { low: Math.min(...v), high: Math.max(...v) } : null;
}

/** tokens.xyz's description of the company, when it has one. */
function aboutText(asset: unknown): string | null {
  const d = (asset as { description?: unknown } | null)?.description;
  return typeof d === "string" && d.trim() ? d.trim() : null;
}

/**
 * Share-equivalents on-chain across every token for this company (tokens.xyz reports scaled units).
 * Only when every token counts the same unit: gold's tokens mix troy ounces and ETF shares, and a
 * sum of the two is not a quantity of anything.
 */
function tokenizedSupply(variants: TxzVariant[]): number | null {
  if (new Set(variants.map((v) => v.kind)).size !== 1) return null;
  const supplies = variants
    .map((v) => v.market.circulatingSupply ?? v.market.totalSupply)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return supplies.length ? supplies.reduce((a, b) => a + b, 0) : null;
}

/**
 * Price history for the chart: a year of daily candles and the last 24 hours hourly, each with the
 * real stock's closes alongside when the two are comparable 1:1. Kept as SEPARATE series on purpose:
 * a dead variant quoting a stale last trade against a live stock price is a fact worth seeing, not
 * one to average away. The 1W, 1M, 3M and 1Y tabs are slices of `daily`; 1D is `intraday`.
 *
 * Day and 52-week ranges come from the real stock where there is one, else from the token, and
 * `basis` says which.
 */
function priceHistory(
  daily: TxzOhlcv | null | undefined,
  intraday: TxzOhlcv | null | undefined,
  klinesDaily: BpKline[] | null | undefined,
  klinesHourly: BpKline[] | null | undefined,
  ticker: string,
  reference: PriceReference | null,
): PriceHistory | null {
  // Only chart the real stock alongside when the reference is per-share, never a per-ounce metal.
  const perShare = reference?.basis === "share";
  const dailyToken = toCandles(daily?.candles);
  const hourlyToken = toCandles(intraday?.candles);
  const dailyRef = perShare ? toCloses(klinesDaily) : [];
  const hourlyRef = perShare ? toCloses(klinesHourly) : [];

  if (dailyToken.length === 0 && dailyRef.length === 0) return null;

  const useReference = dailyRef.length > 0;
  const yearAgo = Date.now() / 1000 - 365 * 86_400;
  return {
    mint: daily?.mint ?? null,
    daily: { token: dailyToken, reference: dailyRef.length ? { ticker, closes: dailyRef } : null },
    intraday: hourlyToken.length || hourlyRef.length
      ? { token: hourlyToken, reference: hourlyRef.length ? { ticker, closes: hourlyRef } : null }
      : null,
    ranges: {
      basis: useReference ? "reference" : "token",
      // Closes, not highs and lows: in a thin token one stray fill makes a wick nobody could trade
      // at (gold's token candles showed a $5,652 "high" against a ~$4,300 market).
      day: useReference ? range(hourlyRef.map((c) => c.close)) : range(hourlyToken.map((c) => c.close)),
      week52: useReference
        ? range(dailyRef.filter((c) => c.time >= yearAgo).map((c) => c.close))
        : range(dailyToken.filter((c) => c.time >= yearAgo).map((c) => c.close)),
    },
  };
}
