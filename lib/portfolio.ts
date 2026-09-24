// Portfolio for a wallet — reads by PUBKEY only (never a signature), scores every holding with the
// Trova Score, and finds a higher-scoring variant of the same asset when one exists.
// Degrades per source: Helius + tokens.xyz are required; Backpack context and snapshot history
// are optional and reported in `warnings` when unavailable.

import { pool } from "./async";
import { getBackpackIssuedMints, getExternalTickers, getSecurities } from "./backpack";
import { getWalletTokens, NATIVE_SOL_MINT } from "./helius";
import { getVariantHistory } from "./history";
import { sellNow } from "./jupiter";
import { withScaledAmounts } from "./token-extensions";
import { equityFeed, getPythPrices } from "./pyth";
import { getChangeSignals, sortSignals } from "./signals";
import { getVariantMarkets, getVariants, resolveIssuer, type TxzVariantMarket } from "./tokens-xyz";
import { METHOD_VERSION, pickBest, portfolioScores, rankVariants, type RankedVariant, type ScoreContext } from "./trust-score";
import { getCuratedUniverse, type UniverseEntry } from "./universe";
import type { Asset, CashBalance, ExitQuote, Holding, PortfolioSummary, Rating, Signal, Tier, TrovaScore, TxzVariant, Variant } from "./types";

// Cash = SOL (fees) plus the USD stablecoins. Each mint below was resolved against tokens.xyz on
// 2026-09-22 and came back category "stablecoin" with the symbol shown. Euro-denominated stables are
// deliberately absent: the portfolio totals in dollars. Anything else a wallet holds is neither cash
// nor a tokenized stock, and is counted in `otherTokens` rather than valued.
const CASH_MINTS: Record<string, string> = {
  [NATIVE_SOL_MINT]: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS",
  DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT: "USDe",
  "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u": "FDUSD",
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
};

// Exit cost costs two Jupiter quotes per holding, so only the largest positions are measured.
const EXIT_QUOTED_HOLDINGS = 4;

export const CONCENTRATION_SHARE = 0.5;   // one variant ≥ 50% of tokenized holdings → concentration signal
const MAX_LISTED = 3;                     // beyond this many same-kind signals, summarise instead of listing

// Valuation (display only — price never affects the score). Dead variants keep quoting their last
// trade: CLSKx sat at $1,684 vs a real CLSK price of $12.60 (2026-09-15). So a variant's own price is
// used only while it is actually trading; otherwise we fall back to the real stock price — Pyth first,
// then Backpack — and leave the holding unpriced when no valid reference exists.
export const PRICE_FRESH_MS = 48 * 60 * 60 * 1000;
export const REFERENCE_DIVERGENCE = 0.25;

export type PriceSource = "market" | "pyth" | "backpack" | "unknown";

export interface Valuation {
  priceUsd: number | null;
  source: PriceSource;
  stale: boolean;
}

export interface ReferencePrice {
  priceUsd: number;
  source: "pyth" | "backpack";
}

export function valuePrice(
  market: { price?: number; liquidity?: number; lastTradeAt?: number; trade24h?: number },
  reference: ReferencePrice | null,
  now = Date.now(),
): Valuation {
  const price = market.price ?? 0;
  const traded = (market.lastTradeAt != null && now - market.lastTradeAt <= PRICE_FRESH_MS) || (market.trade24h ?? 0) > 0;
  const fresh = price > 0 && (market.liquidity ?? 0) > 0 && traded;
  const divergent = reference != null && price > 0 && Math.abs(price / reference.priceUsd - 1) > REFERENCE_DIVERGENCE;
  if (fresh && !divergent) return { priceUsd: price, source: "market", stale: false };
  if (reference != null && reference.priceUsd > 0) return { priceUsd: reference.priceUsd, source: reference.source, stale: true };
  return { priceUsd: null, source: "unknown", stale: true };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct = (share: number) => `${Math.round(share * 100)}%`;
const rating = (s: TrovaScore) => (s.score == null ? "NR" : `${s.grade} ${s.score}`);

function assetOf(entry: UniverseEntry): Asset {
  return { assetId: entry.asset.assetId, name: entry.asset.name, symbol: entry.asset.symbol, assetClass: entry.assetClass };
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

/** Portfolio-level signals derived from current holdings (factual, never advice). */
export function portfolioSignals(holdings: Holding[]): Signal[] {
  const total = holdings.reduce((s, h) => s + h.valueUsd, 0);
  if (total <= 0) return [];
  const out: Signal[] = [];

  const top = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd)[0];
  const topShare = top.valueUsd / total;
  if (topShare >= CONCENTRATION_SHARE) {
    out.push({
      kind: "concentration", severity: "warn", assetId: top.asset.assetId, mint: top.variant.mint, symbol: top.variant.symbol,
      message: `${pct(topShare)} of your tokenized holdings are in one variant (${top.variant.symbol}).`,
    });
  }

  const speculative = holdings.filter((h) => h.variant.score.instrument.speculative);
  if (speculative.length) {
    const value = speculative.reduce((s, h) => s + h.valueUsd, 0);
    out.push({
      kind: "speculative", severity: "warn",
      message: `${usd(value)} (${pct(value / total)}) is in speculative pre-IPO exposure: ${speculative.map((h) => h.variant.symbol).join(", ")}. These ratings update as more information becomes public.`,
    });
  }

  // Advisories are always listed individually — they're the strongest warning we have.
  for (const h of holdings) {
    const s = h.variant.score;
    if (!s.advisory) continue;
    out.push({
      kind: "advisory", severity: s.advisory.status === "caution" ? "warn" : "danger",
      assetId: h.asset.assetId, mint: h.variant.mint, symbol: h.variant.symbol,
      message: `tokens.xyz advisory on ${h.variant.symbol}: ${s.advisory.status}${s.advisory.reason ? ` — ${s.advisory.reason}` : ""}`,
    });
  }

  // A wallet can hold dozens of untradable variants; list a few, then summarise.
  const untradable = holdings.filter((h) => !h.variant.score.advisory && !h.variant.score.routable).sort((a, b) => b.valueUsd - a.valueUsd);
  if (untradable.length <= MAX_LISTED) {
    for (const h of untradable) {
      out.push({
        kind: "not-routable", severity: "warn", assetId: h.asset.assetId, mint: h.variant.mint, symbol: h.variant.symbol,
        message: `${h.variant.symbol} can't be traded through Trova right now — ${h.variant.score.notRoutableReason}.`,
      });
    }
  } else if (untradable.length) {
    const value = untradable.reduce((s, h) => s + h.valueUsd, 0);
    out.push({
      kind: "not-routable", severity: "warn",
      message: `${untradable.length} holdings can't be traded through Trova right now (${usd(value)}, ${pct(value / total)}): ${untradable.slice(0, MAX_LISTED).map((h) => h.variant.symbol).join(", ")} and ${untradable.length - MAX_LISTED} more.`,
    });
  }

  const referenced = holdings.filter((h) => h.valuation.source === "pyth" || h.valuation.source === "backpack");
  if (referenced.length) {
    const viaPyth = referenced.filter((h) => h.valuation.source === "pyth").length;
    const sources = viaPyth === referenced.length ? "Pyth" : viaPyth ? `Pyth (${viaPyth}) and Backpack` : "Backpack";
    out.push({
      kind: "stale-price", severity: "info",
      message: `${referenced.length} holding${referenced.length > 1 ? "s are" : " is"} valued at the real stock price from ${sources} because the on-chain price is stale: ${referenced.slice(0, MAX_LISTED).map((h) => h.variant.symbol).join(", ")}${referenced.length > MAX_LISTED ? ` and ${referenced.length - MAX_LISTED} more` : ""}.`,
    });
  }
  const unpriced = holdings.filter((h) => h.valuation.source === "unknown");
  if (unpriced.length) {
    out.push({
      kind: "stale-price", severity: "warn",
      message: `${unpriced.length} holding${unpriced.length > 1 ? "s" : ""} couldn't be valued and ${unpriced.length > 1 ? "are" : "is"} excluded from the total (no recent on-chain price and no reference price): ${unpriced.slice(0, MAX_LISTED).map((h) => h.variant.symbol).join(", ")}${unpriced.length > MAX_LISTED ? ` and ${unpriced.length - MAX_LISTED} more` : ""}.`,
    });
  }

  const upgradable = holdings.filter((h) => h.betterVariant).sort((a, b) => b.valueUsd - a.valueUsd);
  for (const h of upgradable.slice(0, MAX_LISTED)) {
    const b = h.betterVariant!;
    out.push({
      kind: "better-variant", severity: "info", assetId: h.asset.assetId, mint: h.variant.mint, symbol: h.variant.symbol,
      message: `${h.asset.name}: ${b.symbol} (${b.issuer}) rates ${rating(b.score)} vs your ${h.variant.symbol} at ${rating(h.variant.score)}.${h.closeCall ? " This is a close call." : ""}`,
    });
  }
  if (upgradable.length > MAX_LISTED) {
    out.push({
      kind: "better-variant", severity: "info",
      message: `${upgradable.length - MAX_LISTED} other holdings have a higher-rated variant of the same asset.`,
    });
  }
  return out;
}

function shareBy<K extends string>(holdings: Holding[], keys: readonly K[], keyOf: (h: Holding) => K): Record<K, number> {
  const total = holdings.reduce((s, h) => s + h.valueUsd, 0);
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  if (total <= 0) return out;
  for (const h of holdings) out[keyOf(h)] = (out[keyOf(h)] ?? 0) + h.valueUsd;
  for (const k of Object.keys(out) as K[]) out[k] = Math.round((out[k] / total) * 1000) / 10;
  return out;
}

export async function buildPortfolio(wallet: string): Promise<PortfolioSummary> {
  const warnings: string[] = [];
  const soft = <T>(label: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => { warnings.push(`${label} unavailable: ${message(e)}`); return null; });
  const universeErrors: { scope: string; error: string }[] = [];

  const [{ solBalance, tokens: rawTokens }, universe, securities, backpackMints, referencePrices] = await Promise.all([
    getWalletTokens(wallet),
    getCuratedUniverse(universeErrors),
    soft("Backpack securities list", getSecurities()),
    soft("Backpack issuer list", getBackpackIssuedMints()),
    soft("Backpack reference prices", getExternalTickers()),
  ]);
  // Token-2022 mints can carry a scaled-UI multiplier: a split or distribution the issuer applied by
  // rescaling balances. The RPC returns the raw amount, so apply it before anything is valued.
  const tokens = await withScaledAmounts(rawTokens);

  for (const e of universeErrors) warnings.push(`${e.scope} unavailable: ${e.error}`);

  // Native SOL and wrapped SOL are both shown as SOL cash.
  const amounts = new Map(tokens.map((t) => [t.mint, t.amount]));
  const rawAmounts = new Map(tokens.map((t) => [t.mint, BigInt(t.rawAmount)]));
  amounts.set(NATIVE_SOL_MINT, (amounts.get(NATIVE_SOL_MINT) ?? 0) + solBalance);
  // Wallets can hold thousands of unrelated tokens (the xStocks issuer wallet holds 1,254), so the
  // mint→asset lookup goes out in capped batches and a failed batch only costs those tokens.
  const mintList = [...amounts.keys()];
  const batches: string[][] = [];
  for (let i = 0; i < mintList.length; i += 50) batches.push(mintList.slice(i, i + 50));
  const markets = new Map<string, TxzVariantMarket>();
  await pool(batches, 3, async (batch) => {
    try {
      for (const m of await getVariantMarkets(batch)) markets.set(m.mint, m);
    } catch (e) {
      warnings.push(`Market lookup failed for ${batch.length} tokens (they're counted as unrecognised): ${message(e)}`);
    }
  });

  const cash: CashBalance[] = [];
  const held: { mint: string; amount: number; entry: UniverseEntry }[] = [];
  let otherTokens = 0;
  for (const [mint, amount] of amounts) {
    if (!(amount > 0)) continue;
    const market = markets.get(mint);
    if (CASH_MINTS[mint]) {
      const priceUsd = market?.market.price ?? null;
      cash.push({ symbol: CASH_MINTS[mint], mint, amount, priceUsd, valueUsd: priceUsd == null ? null : amount * priceUsd });
      continue;
    }
    const entry = market ? universe.get(market.assetId) : undefined;
    if (entry) held.push({ mint, amount, entry });
    else otherTokens++;
  }

  const assetIds = [...new Set(held.map((h) => h.entry.asset.assetId))];
  const variantsByAsset = new Map<string, TxzVariant[]>();
  // Pyth reference prices for the underlying stocks/ETFs (1:1 tokens only).
  const pythSymbols = held
    .filter((h) => h.entry.assetClass === "stock" || h.entry.assetClass === "etf")
    .map((h) => equityFeed(h.entry.asset.symbol));
  const [change, pyth, history] = await Promise.all([
    held.length ? soft("Change history", getChangeSignals({ mints: held.map((h) => h.mint), days: 30 })) : Promise.resolve(null),
    pythSymbols.length ? soft("Pyth prices", getPythPrices(pythSymbols)) : Promise.resolve(null),
    held.length ? soft("Rating history", getVariantHistory(held.map((h) => h.mint), 90)) : Promise.resolve(null),
    pool(assetIds, 8, async (id) => {
      try {
        variantsByAsset.set(id, await getVariants(id));
      } catch (e) {
        warnings.push(`Variants for ${id} unavailable: ${message(e)}`);
      }
    }),
  ]);
  const historyDays = change?.historyDays ?? 0;

  const holdings: Holding[] = [];
  for (const h of held) {
    const variants = variantsByAsset.get(h.entry.asset.assetId);
    if (!variants) { otherTokens++; continue; }
    const ctxFor = (v: TxzVariant): ScoreContext => ({
      assetId: h.entry.asset.assetId,
      canonicalSource: h.entry.asset.canonicalMarket?.source,
      issuerConfirmed: backpackMints?.has(v.mint),
      historyDays,
    });
    const ranked = rankVariants(variants, ctxFor);
    const mine = ranked.find((r) => r.variant.mint === h.mint);
    if (!mine) {
      otherTokens++;
      warnings.push(`${h.mint} isn't listed among ${h.entry.asset.name}'s variants (it may be hidden by an advisory).`);
      continue;
    }
    // Reference price only where the token tracks one listed share 1:1 (stocks/ETFs), never for
    // metals (per-ounce tokens vs per-share ETFs) or private companies.
    const ticker = h.entry.asset.symbol.toUpperCase();
    const oneForOne = h.entry.assetClass === "stock" || h.entry.assetClass === "etf";
    const pythPrice = oneForOne ? pyth?.get(equityFeed(ticker)) : undefined;
    const backpackPrice = oneForOne && (securities?.has(ticker) ?? false)
      ? Number(referencePrices?.get(ticker)?.lastPrice ?? Number.NaN) : Number.NaN;
    const reference: ReferencePrice | null = pythPrice
      ? { priceUsd: pythPrice.priceUsd, source: "pyth" }
      : Number.isFinite(backpackPrice) ? { priceUsd: backpackPrice, source: "backpack" } : null;
    const valuation = valuePrice(mine.variant.market, reference);

    const { best, closeCall } = pickBest(ranked);
    const better =
      best && best.variant.mint !== h.mint &&
      (!mine.score.routable || !mine.score.rated || best.score.score! > (mine.score.score ?? 0))
        ? best : null;
    const view = (r: RankedVariant) => variantView(r.variant, r.score, h.entry.asset.assetId, backpackMints?.has(r.variant.mint) ?? false);
    holdings.push({
      asset: assetOf(h.entry),
      variant: view(mine),
      amount: h.amount,
      valueUsd: h.amount * (valuation.priceUsd ?? 0),
      valuation,
      betterVariant: better ? view(better) : null,
      closeCall: better ? closeCall : false,
      history: history?.get(h.mint) ?? null,
    });
  }
  holdings.sort((a, b) => b.valueUsd - a.valueUsd);

  // What it would actually cost to leave each position, quoted both ways through Jupiter at the
  // size held. Only the largest positions are measured (two quotes each), and a failure leaves the
  // holding without a quote rather than failing the portfolio.
  // Two different questions, both measured. `sellNow` is the holder's question — sell this exact
  // balance today, one way — and it is what the holdings list shows. `exitQuote` is the round trip,
  // kept for the asset-page comparison between tokens. In a thin market they differ enormously:
  // most of a round trip's loss is buying INTO the thin market, which a holder never has to do.
  await pool(holdings.slice(0, EXIT_QUOTED_HOLDINGS), 1, async (h) => {
    if (!(h.valueUsd > 0)) return;
    try {
      const raw = rawAmounts.get(h.variant.mint) ?? 0n;
      const sale = await sellNow(h.variant.mint, raw, h.valueUsd);
      h.sellNow = sale;
      // Keep the legacy field populated from the same measurement so existing readers stay correct.
      h.exitQuote = {
        status: sale.status,
        roundTripPct: sale.lossPct,
        routable: sale.status === "ok",
        usdSize: Math.round(h.valueUsd),
        routeLabels: sale.routeLabels,
      } satisfies ExitQuote;
    } catch {
      h.sellNow = null;
      h.exitQuote = null;
    }
  });

  const scored = portfolioScores(holdings.map((h) => ({ valueUsd: h.valueUsd, score: h.variant.score })));
  return {
    wallet,
    asOf: Date.now(),
    methodVersion: METHOD_VERSION,
    totalValueUsd: holdings.reduce((s, h) => s + h.valueUsd, 0),
    cashValueUsd: cash.reduce((s, c) => s + (c.valueUsd ?? 0), 0),
    cash,
    otherTokens,
    scores: { overall: scored.overall, ownership: scored.ownership, exit: scored.exit },
    needsAttentionUsd: scored.needsAttentionUsd,
    speculativeUsd: scored.speculativeUsd,
    allocationByGrade: shareBy<Rating>(holdings, ["A", "B", "C", "D", "NR"], (h) => h.variant.score.grade),
    allocationByTier: shareBy<Tier>(holdings, ["tier1", "tier2", "tier3"], (h) => h.variant.tier),
    allocationByClass: shareBy<string>(holdings, [], (h) => h.asset.assetClass),
    holdings,
    signals: sortSignals([...portfolioSignals(holdings), ...(change?.signals ?? [])]),
    historyDays,
    warnings,
  };
}
