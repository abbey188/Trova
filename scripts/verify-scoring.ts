// Rubric checks for the Trova Score, using fixtures shaped like real tokens.xyz variants.
// Run: npx tsx scripts/verify-scoring.ts   (exits non-zero on any failure)

import assert from "node:assert/strict";
import { borderlineOf, classifyInstrument, pickBest, rankVariants, redemptionNote, scoreVariant } from "../lib/trust-score";
import type { TxzMarket, TxzVariant } from "../lib/types";

type Fixture = Omit<Partial<TxzVariant>, "market"> & { market?: Partial<TxzMarket> };

const DEEP: Partial<TxzMarket> = { liquidity: 3_500_000, trade24h: 30_000, volume24hUSD: 2_500_000, holder: 40_000 };
const MAX: Partial<TxzMarket> = { liquidity: 10_000_000, trade24h: 150_000, volume24hUSD: 25_000_000, holder: 100_000 };

let seq = 0;
function variant(f: Fixture): TxzVariant {
  const mint = f.mint ?? `mint-${++seq}`;
  return {
    variantId: mint, mint, kind: "tokenized_equity", name: "Fixture", symbol: "FIX", stockVariantTier: "cash_redeemable",
    ...f,
    market: { price: 100, decimals: 6, ...DEEP, ...f.market },
  } as TxzVariant;
}

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}\n  ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}

// ---- instrument classification (names/labels from live data, 2026-09-15) ----

check("T-Mobile Ondo is a listed tracker, not pre-IPO", () => {
  const v = variant({ name: "T-Mobile US (Ondo Tokenized)", symbol: "TMUSon", label: "Ondo", tags: ["Ondo"] });
  assert.equal(classifyInstrument(v, { assetId: "t-mobile" }).class, "backed-tracker");
});

check("T-Mobile xStock is a listed tracker, not pre-IPO", () => {
  const v = variant({ name: "T-Mobile xStock", symbol: "TMUSx", label: "xStock", tags: ["xStock"] });
  assert.equal(classifyInstrument(v, { assetId: "t-mobile" }).class, "backed-tracker");
});

check("Tessera tOpenAI is pre-IPO exposure", () => {
  const v = variant({ name: "T-OpenAI", symbol: "tOpenAI", issuer: "Tessera", label: "Tessera", stockVariantTier: "not_redeemable" });
  const info = classifyInstrument(v, { assetId: "openai" });
  assert.equal(info.class, "pre-ipo-exposure");
  assert.equal(info.speculative, true);
});

check("tKalshi is pre-IPO by naming convention alone (no issuer, no tags, no context)", () => {
  const v = variant({ name: "T-Kalshi", symbol: "tKalshi", label: "tKalshi", stockVariantTier: null, tags: ["category:equity"] });
  assert.equal(classifyInstrument(v).class, "pre-ipo-exposure");
});

check("pre-* asset id marks pre-IPO", () => {
  assert.equal(classifyInstrument(variant({ name: "Kalshi", symbol: "KAL" }), { assetId: "pre-prelwgkk" }).class, "pre-ipo-exposure");
});

check("Figure AI PreStocks is detected from its name", () => {
  const v = variant({ name: "Figure AI PreStocks", symbol: "FIGUREAI", label: "FIGUREAI", stockVariantTier: "not_redeemable" });
  assert.equal(classifyInstrument(v, { assetId: "figure-ai" }).class, "pre-ipo-exposure");
});

check("SpaceX PreStocks is SPV exposure and claims nothing about listing status", () => {
  // No source we have distinguishes a listed company from a venue-quoted private one:
  // Backpack lists SPCX.US and Pyth publishes Equity.US.SPCX/USD, and SpaceX is private.
  // So the copy must never assert whether the company is listed.
  const v = variant({ name: "SpaceX PreStocks", symbol: "SPACEX", label: "PreStocks", stockVariantTier: "not_redeemable" });
  const info = classifyInstrument(v, { assetId: "spacex" });
  assert.equal(info.class, "pre-ipo-exposure");
  assert.doesNotMatch(info.summary, /publicly listed/);
  assert.match(info.summary, /no ownership, voting, dividend or information rights/);
  assert.match(info.summary, /updates as more information becomes public/);
});

check("Backpack share-redeemable is a direct share claim", () => {
  const v = variant({ name: "SpaceX - Backpack Securities", symbol: "SPCX", issuer: "Backpack Securities", stockVariantTier: "share_redeemable" });
  assert.equal(classifyInstrument(v, {}).class, "direct-share");
});

check("BABA not redeemable but listed is not pre-IPO", () => {
  const v = variant({ name: "Alibaba Group Holding - Backpack Securities", symbol: "BABA", stockVariantTier: "not_redeemable" });
  assert.equal(classifyInstrument(v, { assetId: "alibaba" }).class, "non-redeemable-listed");
});

check("leveraged kind is leveraged", () => {
  assert.equal(classifyInstrument(variant({ kind: "leveraged", symbol: "TQQQx", stockVariantTier: null })).class, "leveraged");
});

// ---- rubric, not caps ----

check("pre-IPO exposure is D through the rubric even with a perfect market", () => {
  const s = scoreVariant(variant({ name: "OpenAI PreStocks", label: "PreStocks", stockVariantTier: "not_redeemable", market: MAX }));
  assert.equal(s.structure.components.product, 0);
  assert.equal(s.grade, "D");
  assert.ok(s.score! < 50, `score ${s.score}`);
});

check("pre-IPO is NOT capped: gaining a share-redemption path lifts the grade", () => {
  const s = scoreVariant(variant({ name: "OpenAI PreStocks", label: "PreStocks", stockVariantTier: "share_redeemable", market: MAX }));
  assert.equal(s.instrument.class, "pre-ipo-exposure");
  assert.ok(s.score! >= 65, `expected B or better, got ${s.score} ${s.grade}`);
});

check("compromised advisory caps at 15 and blocks routing", () => {
  const s = scoreVariant(variant({ advisory: { status: "compromised", reason: "Do not interact" }, market: MAX }));
  assert.ok(s.score! <= 15);
  assert.equal(s.routable, false);
  assert.match(s.notRoutableReason!, /Do not interact/);
});

check("blocked advisory is hidden", () => {
  assert.equal(scoreVariant(variant({ advisory: { status: "blocked" } })).hidden, true);
});

check("too little data is Not Rated, never a guessed number", () => {
  const s = scoreVariant(variant({ symbol: "OUSG", kind: "yield", stockVariantTier: null, market: { liquidity: 0, trade24h: 0, volume24hUSD: 0, holder: 0 } }));
  assert.equal(s.grade, "NR");
  assert.equal(s.score, null);
  assert.equal(s.routable, false);
});

check("thin liquidity is not routable", () => {
  assert.equal(scoreVariant(variant({ market: { liquidity: 40_000 } })).routable, false);
});

check("no trades in 24h is not routable", () => {
  assert.equal(scoreVariant(variant({ market: { trade24h: 0 } })).routable, false);
});

// ---- missing data (v3.2) ----

check("unreported redemption on a pre-IPO token uses its class peers, so silence can't beat an explicit 'not redeemable'", () => {
  const silent = scoreVariant(variant({ mint: "tk", name: "T-Kalshi", symbol: "tKalshi", label: "tKalshi", stockVariantTier: null }));
  const explicit = scoreVariant(variant({ mint: "ps", name: "Kalshi PreStocks", symbol: "KALSHI", label: "PreStocks", stockVariantTier: "not_redeemable" }));
  assert.equal(silent.structure.components.redemptionBasis, "class-peers");
  assert.equal(silent.structure.components.redemption, 30);
  assert.equal(silent.score, explicit.score);
  assert.match(redemptionNote(silent)!, /most conservative value reported by other pre-IPO tokens/);
  assert.equal(redemptionNote(explicit), null);
});

check("unreported redemption with no reporting peers stays neutral", () => {
  const s = scoreVariant(variant({ kind: "leveraged", symbol: "TQQQx", stockVariantTier: null }));
  assert.equal(s.structure.components.redemptionBasis, "neutral");
  assert.equal(s.structure.components.redemption, 50);
  assert.match(redemptionNote(s)!, /neutrally/);
});

// ---- never scored ----

check("price never affects the score", () => {
  const a = scoreVariant(variant({ mint: "p1", market: { price: 1 } }));
  const b = scoreVariant(variant({ mint: "p2", market: { price: 99_999 } }));
  assert.equal(a.score, b.score);
});

check("tier never affects the score", () => {
  const a = scoreVariant(variant({ mint: "t1", liquidityTier: "tier1" }));
  const b = scoreVariant(variant({ mint: "t3", liquidityTier: "tier3" }));
  assert.equal(a.score, b.score);
});

// ---- borderline ----

check("borderline marks scores within 3 points of a cutoff", () => {
  assert.deepEqual(borderlineOf(81), { cutoff: 80, adjacentGrade: "B" });
  assert.deepEqual(borderlineOf(77), { cutoff: 80, adjacentGrade: "A" });
  assert.deepEqual(borderlineOf(47), { cutoff: 50, adjacentGrade: "C" });
  assert.deepEqual(borderlineOf(68), { cutoff: 65, adjacentGrade: "C" });
  assert.equal(borderlineOf(72), null);
  assert.equal(borderlineOf(20), null);
});

// ---- picking ----

check("best pick skips not-rated and non-routable variants", () => {
  const ranked = rankVariants([
    variant({ mint: "nr", kind: "yield", stockVariantTier: null, market: { liquidity: 0, trade24h: 0, volume24hUSD: 0, holder: 0 } }),
    variant({ mint: "thin", stockVariantTier: "share_redeemable", market: { liquidity: 10_000 } }),
    variant({ mint: "deep", stockVariantTier: "cash_redeemable" }),
  ]);
  assert.equal(pickBest(ranked).best?.variant.mint, "deep");
});

console.log(`${process.exitCode ? "FAILED" : "✓"} ${passed} checks passed`);
