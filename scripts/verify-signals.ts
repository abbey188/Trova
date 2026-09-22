// Checks for "what changed" detection and portfolio signals, using fixture histories.
// Run: pnpm verify:signals   (exits non-zero on any failure)

import assert from "node:assert/strict";
import { comparable, gapPercent } from "../lib/asset";
import { portfolioSignals, valuePrice } from "../lib/portfolio";
import { equityFeed, grantedFeedIds, tokenFeed } from "../lib/pyth";
import { detectSignals, type SnapshotPoint } from "../lib/signals";
import { scoreVariant } from "../lib/trust-score";
import type { Holding, TxzVariant } from "../lib/types";

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

const BASE: SnapshotPoint = {
  snapshot_date: "2026-09-01", mint: "Mint111", asset_id: "tesla", symbol: "TSLAx", method_version: "v3.2",
  score: 87, grade: "A", exit: 80, tier: "tier2", stock_variant_tier: "cash_redeemable",
  advisory_status: null, advisory_reason: null, instrument_class: "backed-tracker", routable: true, not_routable_reason: null,
};

/** One snapshot per day starting 2026-09-01, each overriding BASE. */
function history(...points: Partial<SnapshotPoint>[]): SnapshotPoint[] {
  return points.map((p, i) => ({ ...BASE, snapshot_date: `2026-09-${String(i + 1).padStart(2, "0")}`, ...p }));
}
const kinds = (h: SnapshotPoint[], kind: string) => detectSignals(h).filter((s) => s.kind === kind);

// ---- structural changes fire immediately ----

check("advisory added → danger with the operator's reason", () => {
  const s = kinds(history({}, { advisory_status: "compromised", advisory_reason: "Do not interact" }), "advisory");
  assert.equal(s.length, 1);
  assert.equal(s[0].severity, "danger");
  assert.match(s[0].message, /Do not interact/);
  assert.equal(s[0].detectedAt, Date.parse("2026-09-02T00:00:00Z"));
});

check("advisory cleared → info", () => {
  const s = kinds(history({ advisory_status: "caution" }, {}), "advisory");
  assert.equal(s.length, 1);
  assert.equal(s[0].severity, "info");
});

check("redemption downgrade → warn; upgrade → info", () => {
  assert.equal(kinds(history({}, { stock_variant_tier: "not_redeemable" }), "redemption-change")[0].severity, "warn");
  assert.equal(kinds(history({}, { stock_variant_tier: "share_redeemable" }), "redemption-change")[0].severity, "info");
});

check("reclassified as pre-IPO exposure → warn", () => {
  const s = kinds(history({}, { instrument_class: "pre-ipo-exposure" }), "ownership-change");
  assert.equal(s.length, 1);
  assert.equal(s[0].severity, "warn");
});

check("tier change is neutral info", () => {
  assert.equal(kinds(history({}, { tier: "tier3" }), "tier-change")[0].severity, "info");
});

// ---- noisy changes must persist ----

check("grade flicker never alerts", () => {
  assert.equal(kinds(history({ grade: "A" }, { grade: "B" }, { grade: "A" }, { grade: "B" }, { grade: "A" }), "grade-change").length, 0);
});

check("grade change held for 3 snapshots alerts exactly once, on the confirming day", () => {
  const s = kinds(history({ grade: "A" }, { grade: "A" }, { grade: "B" }, { grade: "B" }, { grade: "B" }, { grade: "B" }), "grade-change");
  assert.equal(s.length, 1);
  assert.equal(s[0].from, "A");
  assert.equal(s[0].to, "B");
  assert.equal(s[0].severity, "warn");
  assert.equal(s[0].detectedAt, Date.parse("2026-09-05T00:00:00Z"));
});

check("grade change caused by a method-version change is ignored", () => {
  const h = history({ grade: "A", method_version: "v3.1" }, { grade: "B" }, { grade: "B" }, { grade: "B" });
  assert.equal(kinds(h, "grade-change").length, 0);
});

check("losing tradability for 3 snapshots → warn; a one-day blip → nothing", () => {
  const lost = kinds(history({}, { routable: false, not_routable_reason: "Liquidity under $50k" }, { routable: false }, { routable: false }), "routability-change");
  assert.equal(lost.length, 1);
  assert.equal(lost[0].severity, "warn");
  assert.equal(kinds(history({}, { routable: false }, {}, {}), "routability-change").length, 0);
});

check("exit score drop of 15+ vs 7-snapshot baseline, held 3 snapshots → one warn", () => {
  const h = history(...Array(7).fill({ exit: 80 }), { exit: 60 }, { exit: 60 }, { exit: 60 }, { exit: 60 });
  const s = kinds(h, "exit-change");
  assert.equal(s.length, 1);
  assert.equal(s[0].severity, "warn");
  assert.equal(s[0].from, "80");
});

check("exit wobble under 15 points never alerts", () => {
  assert.equal(kinds(history(...Array(7).fill({ exit: 80 }), { exit: 70 }, { exit: 70 }, { exit: 70 }), "exit-change").length, 0);
});

check("single snapshot → no signals", () => {
  assert.equal(detectSignals(history({})).length, 0);
});

// ---- valuation: a dead variant's last trade must not price a holding ----

const NOW = Date.parse("2026-09-15T12:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;

check("a trading variant is valued at its own market price", () => {
  const v = valuePrice({ price: 355.71, liquidity: 3_488_187, lastTradeAt: hoursAgo(1), trade24h: 27_211 }, { priceUsd: 356.33, source: "pyth" }, NOW);
  assert.deepEqual(v, { priceUsd: 355.71, source: "market", stale: false });
});

check("a dead variant (CLSKx: $1,684 vs real $12.60, no liquidity, 10 days stale) falls back to the Pyth price", () => {
  const v = valuePrice({ price: 1684.3, liquidity: 0, lastTradeAt: hoursAgo(250), trade24h: 0 }, { priceUsd: 12.597, source: "pyth" }, NOW);
  assert.deepEqual(v, { priceUsd: 12.597, source: "pyth", stale: true });
});

check("the fallback keeps the reference's own source (Backpack when Pyth has no feed)", () => {
  const v = valuePrice({ price: 1684.3, liquidity: 0, lastTradeAt: hoursAgo(250), trade24h: 0 }, { priceUsd: 12.6, source: "backpack" }, NOW);
  assert.equal(v.source, "backpack");
});

check("a price far from the reference is rejected even when the variant traded today", () => {
  const v = valuePrice({ price: 5369.03, liquidity: 1_000_000, lastTradeAt: hoursAgo(2), trade24h: 2 }, { priceUsd: 50.245, source: "pyth" }, NOW);
  assert.equal(v.source, "pyth");
  assert.equal(v.priceUsd, 50.245);
});

check("no reference and no recent trade → unpriced, not a made-up number", () => {
  const v = valuePrice({ price: 100.45, liquidity: 0, lastTradeAt: hoursAgo(900), trade24h: 0 }, null, NOW);
  assert.deepEqual(v, { priceUsd: null, source: "unknown", stale: true });
});

check("a per-ounce metal token with its own live market keeps its market price", () => {
  const v = valuePrice({ price: 4296.65, liquidity: 1_028_000, lastTradeAt: hoursAgo(3), trade24h: 120 }, null, NOW);
  assert.deepEqual(v, { priceUsd: 4296.65, source: "market", stale: false });
});

// ---- asset page: price gap is only shown where the units match ----

check("gap is the on-chain price against the real-world reference", () => {
  assert.equal(gapPercent(356.53, 356.13), 0.11);
  assert.equal(gapPercent(1684.3, 12.597), 13270.64);
  assert.equal(gapPercent(0, 12.597), null);
  assert.equal(gapPercent(12, 0), null);
});

check("gap is suppressed for per-ounce metals and pre-IPO exposure, shown for listed stocks/ETFs", () => {
  const scored = (over: Partial<TxzVariant>) => scoreVariant({
    variantId: "v", mint: "m", kind: "tokenized_equity", name: "Fixture", symbol: "FIX", stockVariantTier: "cash_redeemable",
    ...over,
    market: { price: 1, decimals: 6, liquidity: 3_000_000, trade24h: 20_000, volume24hUSD: 2_000_000, holder: 20_000 },
  } as TxzVariant);
  const stock = scored({ symbol: "TSLAx" });
  const preIpo = scored({ symbol: "OPENAI", name: "OpenAI PreStocks", label: "PreStocks", stockVariantTier: "not_redeemable" });
  const metal = scored({ symbol: "PAXG", kind: "spot", stockVariantTier: null });
  const metalEtf = scored({ symbol: "GLDx", kind: "etf", stockVariantTier: null });
  assert.equal(comparable("stock", "tokenized_equity", stock, "share"), true);
  assert.equal(comparable("etf", "etf", stock, "share"), true);
  assert.equal(comparable("stock", "tokenized_equity", preIpo, "share"), false); // SPV exposure isn't the listed share
  assert.equal(comparable("metal", "spot", metal, "ounce"), true);               // 1 token = 1 troy ounce
  assert.equal(comparable("metal", "etf", metalEtf, "ounce"), false);            // tracks a per-share ETF
  assert.equal(comparable("metal", "spot", metal, "share"), false);              // never mix units
});

// ---- Pyth entitlements (Hermes 403s the whole request if one id is outside the grant) ----

check("granted feed ids are collected from every grant selector", () => {
  // Shape of a real free-plan token (2026-09-16): one symbol-selector grant, one feed-id grant.
  const ids = grantedFeedIds({
    entitlements: {
      grants: [
        { selector: { } },
        { selector: { feed_ids: [1, 6, 346, 1435] } },
        { selector: { feed_ids: [1435, 1472] } },
      ],
    },
  });
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 6, 346, 1435, 1472]);
});

check("no entitlements payload → no feeds requested from Hermes", () => {
  assert.equal(grantedFeedIds({}).size, 0);
  assert.equal(grantedFeedIds({ entitlements: { grants: [] } }).size, 0);
});

check("feed symbol helpers match Pyth's naming", () => {
  assert.equal(equityFeed("tsla"), "Equity.US.TSLA/USD");
  assert.equal(tokenFeed("tslax"), "Crypto.TSLAX/USD");
});

// ---- portfolio signals ----

function holding(symbol: string, valueUsd: number, over: Partial<TxzVariant> = {}): Holding {
  const v = {
    variantId: symbol, mint: `mint-${symbol}`, kind: "tokenized_equity", name: symbol, symbol, stockVariantTier: "cash_redeemable",
    ...over,
    market: { price: 1, decimals: 6, liquidity: 3_000_000, trade24h: 20_000, volume24hUSD: 2_000_000, holder: 20_000 },
  } as TxzVariant;
  const score = scoreVariant(v);
  return {
    asset: { assetId: symbol.toLowerCase(), name: symbol, symbol, assetClass: "stock" },
    variant: {
      variantId: symbol, mint: v.mint, assetId: symbol.toLowerCase(), kind: v.kind, issuer: "Test", symbol, name: symbol,
      tier: score.tier, priceUsd: 1, liquidityUsd: 3_000_000, volume24hUsd: 2_000_000, organicVolume24hUsd: 2_000_000, score,
    },
    amount: valueUsd,
    valueUsd,
    valuation: { priceUsd: 1, source: "market", stale: false },
    betterVariant: null,
  };
}

check("concentration fires at ≥50% in one variant, not below", () => {
  assert.equal(portfolioSignals([holding("TSLAx", 600), holding("AAPLx", 400)]).filter((s) => s.kind === "concentration").length, 1);
  assert.equal(portfolioSignals([holding("TSLAx", 400), holding("AAPLx", 300), holding("MSFTx", 300)]).filter((s) => s.kind === "concentration").length, 0);
});

check("speculative exposure is always called out with the update note", () => {
  const s = portfolioSignals([holding("TSLAx", 800), holding("OPENAI", 200, { label: "PreStocks", name: "OpenAI PreStocks", stockVariantTier: "not_redeemable" })])
    .filter((x) => x.kind === "speculative");
  assert.equal(s.length, 1);
  assert.match(s[0].message, /\$200 \(20%\).*OPENAI.*update as more information becomes public/);
});

check("empty portfolio → no signals", () => {
  assert.deepEqual(portfolioSignals([]), []);
});

console.log(`${process.exitCode ? "FAILED" : "✓"} ${passed} checks passed`);
