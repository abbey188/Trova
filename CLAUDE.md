# Trova — project brief for Claude Code

Trova is **insights, analytics, trading and portfolio management for tokenized
assets on Solana** (stocks first; also ETFs and metals; treasuries TBD). Users
hold these LONG-TERM. Trova reads a wallet, scores every on-chain variant of an
asset (two pillars + a combined **Trova Score**), shows which variant is soundest
and *why*, tracks **how that changes over time**, and lets users buy / sell /
de-risk via Jupiter. Hackathon: Stocklana (Solana Foundation), deadline Fri 25 Sep 4pm ET (moved from 18 Sep).

## The one thing that makes Trova different
When you buy/sell or just hold, you get a **safety report**: which variant is
soundest and *why*, and alerts when that changes. The same asset often has several
variants (e.g. SpaceX: Backpack SPCX share-redeemable $9M liquidity; Backed SPCXx
cash-redeemable; PreStocks SPACEX not redeemable). Market-only risk scores (incl.
tokens.xyz risk-summary) rate pre-IPO exposure products "A / Established";
Trova's Structure pillar shows there is no path to the real share.

## Non-negotiable principles
1. Reading the portfolio uses only the wallet PUBKEY — never a signature.
   Signatures happen only on an action (buy/swap/de-risk/recurring).
2. Tier is a neutral LIQUIDITY label ("Tier 1/2/3", never "experimental"), never
   scored. Price and price gaps are display-only, never scored. Only tokens.xyz
   advisories hard-cap the score.
3. Factual only — never predictive / never "buy this, it'll go up".
   Speculative instruments (pre-IPO / SPV exposure) are ALWAYS labelled
   "Speculative" with `INSTRUMENT_INFO` copy wherever they appear (lists, holdings,
   asset page, buy sheet), and every rating states it updates as information becomes public.
4. Secrets stay in Route Handlers (`TOKENS_XYZ_API_KEY` etc.). Only the
   domain-restricted RPC + Supabase anon/URL are `NEXT_PUBLIC_`.
5. Asset-class-agnostic engine; DEMO stocks. Mainnet only (Jupiter has no
   devnet aggregator; xStocks/Ondo are mainnet-only).
6. Degrade, don't crash — any single data source can be missing.

## Stack
Next.js 15 (App Router) + TS · Tailwind v4 + shadcn/ui (Radix base, style
`radix-nova`, `iconLibrary: "hugeicons"` in components.json) · Hugeicons
(`@hugeicons/react` + `@hugeicons/core-free-icons`; NOT lucide) · fonts via
`next/font/google` (no package) · next-themes · Recharts + inline-SVG sparklines ·
TanStack Query · **Solana Kit** — `@solana/kit` 8 + `@solana/kit-plugin-wallet`
(Wallet Standard: Phantom/Solflare/Backpack) + `@solana/kit-plugin-rpc` +
`@solana/react` (per current Solana docs; wallet-adapter and web3.js v1 are legacy —
don't add them) · Helius RPC (mainnet) · Next.js Route Handlers · Supabase · Vercel.
Design tokens: lime #C6F24E = ACTION only; trust emerald #12B981 / amber
#F5A524 / red #F04438; fonts Space Grotesk (display/numbers) + Plus Jakarta Sans.

## Data sources
- **tokens.xyz** (server, `x-api-key`, base https://api.tokens.xyz/v1): variants,
  risk, curated (stocks|etfs|metals|rwas), trending, ohlcv, news,
  market-snapshots (batch pricing). THE trust foundation. Already provides
  price, liquidity, logo, executionQuality, stockVariantTier — see below.
- **Jupiter** (https://api.jup.ag): quote + swap (referral feeAccount/
  platformFeeBps), recurring (DCA). Execution/routing. Aggregates Raydium +
  Meteora, so do NOT integrate those directly.
- **Helius RPC**: read token accounts + send signed txns. Use
  `getTokenAccountsByOwner` with `{encoding:"jsonParsed"}`, called for BOTH the SPL
  Token and Token-2022 program ids (xStocks are Token-2022). NOTE:
  `getParsedTokenAccountsByOwner` returns "Method not found" on Helius
  (beta + mainnet hosts, tested 2026-09-15). DAS `getTokenAccounts` also works.
- **Backpack** (public, no auth, https://api.backpack.exchange/api/v1, docs
  docs.backpack.exchange): SECOND SOURCE, so we never depend solely on tokens.xyz.
  `tickers?source=External` = real stock price for 1,140 US stocks/ETFs in one
  call (display-only price gap; only for verified 1:1 tickers — gold spot tokens
  are per-oz vs GLD per-share, pre-IPO products aren't 1:1); `klines?source=External`
  = real price history; `market-sessions` + `market-holidays` = US market open/closed;
  `assets` = 1,158 Backpack-issued Solana mints (confirms issuer); `securities` =
  name + CUSIP; `depth` only for 4 Backpack stock spot markets. Jupiter can't route
  to Backpack — data only.
- **Pyth** (lib/pyth.ts): reference prices + confidence + publish time. TWO paths, freshest wins:
  (1) **on-chain, key-free** — price update accounts read via our own RPC: PDA seeds
  `[u16 shard LE, 32-byte feed id]` under PRICE FEED program `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`
  (accounts are OWNED by receiver `rec5EKM…` — deriving from the receiver finds nothing).
  **Shard 1 = live sponsored feeds** (AAPL/MSFT/NVDA/TSLA/XAU… ~20s old); shard 0 is legacy and can be
  weeks stale; tokenized-stock feeds (Crypto.TSLAX/USD) are ~83h stale on-chain → unusable.
  (2) **Hermes REST with `PYTH_API_KEY`** (`Authorization: Bearer`) — needed since the 2026-08-26 upgrade.
  **ENTITLEMENTS MATTER**: a plan grants specific feeds and Hermes 403s the WHOLE request if any id is
  outside the grant, so `getEntitledHermesIds()` mints a JWT (`POST pyth.dourolabs.app/auth/token`),
  reads its grants, maps Lazer ids → Hermes ids via public symbology (`/v1/symbols`), and filters.
  The FREE plan grants only 21 feeds: majors/FX/WTI, XAU+XAG, and just TSLA/QQQ/VOO among equities.
  Prices older than `MAX_PRICE_AGE_SEC` (15m) are dropped. Feed catalogue + symbology need no key.
- **Jupiter execution (lib/jupiter.ts)**: `quote` / `quoteDetailed` / `exitCost` / `exitLadder` /
  `swapTransaction`, against `lite-api.jup.ag/swap/v1` (keyless). `exitCost` BUYS with USDC then
  quotes the sale back, so "what it costs to leave" is measured, not modelled — TSLAx 0.05% at
  $4,661, OPENAI 2.20%, CLSKx **99.99%** (selling $504 returns $0.07). Status is three-valued:
  `ok` / `no-route` / `unavailable` — a failed fetch must never be shown as "you cannot get out".
  Referral fee comes from `JUPITER_REFERRAL_ACCOUNT` + `JUPITER_REFERRAL_FEE_BPS`.
- **Token-2022 scaled UI amount (lib/token-extensions.ts)**: issuers apply splits and distributions
  by changing a multiplier on the MINT. Two uses: (1) a corporate action readable BEFORE it executes
  (`newMultiplier` + `newMultiplierEffectiveTimestamp`) — NFLXx/NFLXon carry Netflix's 10-for-1 split,
  METAx moved +0.055% on 18 Sep; (2) **the RPC does NOT apply it**, so raw balances must be scaled or
  a NFLXx position reads as a tenth of its worth. tokens.xyz prices per SCALED unit.
- **Mint lookups (tokens.xyz)**: `resolveMint` (`/assets/resolve?mint=`) and
  `getVariantMarkets` (≤50 mints/call). `market-snapshots` returns hasMarket:false
  for stocks — don't use it for pricing.

## tokens.xyz real schema (validated 2026-09-15 — trust this over guesses)
`GET /assets/:id/variants` → `{ assetId, variants: [...] }`. Each variant:
- `variantId`, `mint`, `kind` ("tokenized_equity" for stocks, "native"/"yield"
  for crypto), `symbol`, `name`, `label?`, `tags?`, `issuer?` (OFTEN ABSENT →
  fall back to label/tag).
- `liquidityTier` = the current tier ("tier1"|"tier2"|"tier3"); `trustTier` is a
  DEPRECATED alias (usually equal). "experimental" is a legacy alias for tier3.
  Stocks currently top out at tier2.
- `stockVariantTier`: "share_redeemable" | "cash_redeemable" | "not_redeemable"
  (safety order high→low).
- `executionQuality` (may be null): `executionScore` 0..100, `botVolumeRatio`
  0..1 (0.90 = 90% bot/MM flow!), `markoutBps`, `feeBps`, `isEligibleForPrimary`.
- `market`: `price`, `liquidity` (USD depth), `volume24hUSD`, `priceChange24hPercent`,
  `marketCap`, `fdv`, `holder`, `totalSupply`, `circulatingSupply`, `decimals`,
  `logoURI`, `lastTradeAt`.
- `advisory` (may be null): risk warnings → map to flags.
Rate limits: not public (per-key + monthly quota); 429 retryable → cache +
exponential backoff (already in lib/tokens-xyz.ts). Never call from client.

## The Trova Score v3.1 (lib/trust-score.ts)
Live data 2026-09-15: of 508 curated stock variants, 0 tier1 / 8 tier2 / 500 tier3
(tier2 ≈ liquidity ≥ $3M) — so tier can't gate anything.
**Step 1 — classify the instrument** (`classifyInstrument`). NO class is capped —
grades come from the rubric, so a token whose structure improves scores higher.
The class sets Structure's product-rights component: full exposure 100 ·
leveraged 40 · **pre-ipo-exposure 0** (SPV, no ownership/voting/dividend/information
rights → typically grade D, always labelled speculative).
Classes: direct-share (share_redeemable) · backed-tracker (cash_redeemable) ·
non-redeemable-listed · unreported · leveraged · pre-ipo-exposure.
Pre-IPO detected via tokens.xyz asset `canonicalMarket.source === "prestocks"`,
`pre-*` asset ids, PreStocks/Tessera issuer/tags/name, Tessera naming (name "T-<Company>"
AND symbol "t<Company>" — both required; "T-Mobile" TMUSx/TMUSon is a listed stock) —
also catches wrappers that outlive an IPO (SpaceX PreStocks, TSPX). PreStocks states
its tokens are SPV exposure conferring no ownership/voting/dividend/information rights
and may result in total loss. `privateMarkFacts()` exposes last private mark vs
token-implied valuation (display only). Pass `ScoreContext` (assetId, canonicalSource,
underlyingListed from lib/backpack.ts, issuerConfirmed, historyDays).
**Not rated (NR)** when redemption unreported AND no trades AND ≤1 key input reported.
**Missing-data rule (v3.2):** unreported redemption takes the most conservative value
reported by same-class peers (pre-IPO → not_redeemable; 10/10 reporting pre-IPO
variants), so silence never beats an explicit answer; classes with no reporting peers
get neutral 50 + lower confidence. `redemptionBasis` + `redemptionNote()` explain it.
**Step 2 — two pillars**, named **Ownership** and **Exit** in code and on screen (renamed from
Structure / Market health: a metric needs a noun, so an alert can say "TSLAx's exit score fell to 19"):
- **Ownership** ("what do I own?"): redemption 70% (share 100 / cash 75 /
  unreported 50 / not redeemable 30) + product 30% (leveraged 40).
- **Exit** ("can I get in and out?"): mean of liquidity, activity
  (trades+volume), holders, and executionScore when reported — each scored against
  FIXED calibration anchors (quantiles of tradable variants; 50 = median).
- **Trova Score** = geometric mean √(Ownership × Exit), then advisory caps
  (caution 50 / compromised 15 / blocked hidden) — the ONLY caps. Grades A≥80 B≥65
  C≥50 D. **Borderline** = within 3 points of a cutoff (show number + "borderline
  B/C"); ~20% of letters move under ±50% weight changes, so never show a letter alone.
- **Confidence** high/medium/low = how many key inputs are reported (redemption,
  issuer, executionQuality, holders, recent trades). Issuer confirmation lives here,
  not in the score.
- **Routable** = liquidity ≥ $50k AND traded in 24h AND no compromised/blocked advisory.
- **Close call** = best routable variant within 5 points of the runner-up → show both.
- Bot share and price gap are shown as facts, never scored.
- Portfolio = value-weighted overall/structure/market; "Needs attention" = value in
  holdings not routable, grade D, or under an advisory.
Method = composite-indicator practice (OECD/JRC): correlated indicators merged into
one factor, non-compensatory aggregation, weight-sensitivity check. Re-run
scripts/score-diagnostics after any change and bump METHOD_VERSION.

## Change over time (long-term holds)
Daily `VariantSnapshot` per variant (score, grade, pillars, tier, stockVariantTier,
advisory, liquidity, holders). Signals: grade change (must persist 3 snapshots),
redemption change, advisory added/cleared, tier change, market-health drop.
Storage: Supabase — `supabase/migrations/*_variant_snapshots.sql` (tables
`variant_snapshots`, unique (mint, snapshot_date), public read via RLS; `snapshot_runs`).
Rows keep computed scores AND raw tokens.xyz inputs (`raw` jsonb) so history can be
re-scored when METHOD_VERSION changes. Collector + writer: `lib/snapshot.ts`
(`runSnapshot`, `rescoreSnapshots`). Production: Vercel Cron (`vercel.json`, daily
21:30 UTC ± Hobby's hour precision) → `app/api/cron/snapshot/route.ts` (requires
`Authorization: Bearer CRON_SECRET`, maxDuration 300, run ≈100s). Local: `pnpm snapshot`,
`pnpm snapshot:dry`, `pnpm rescore [date]` (after any METHOD_VERSION bump), `pnpm verify:scoring`.
Supabase access: `lib/supabase-rest.ts` (PostgREST via fetch, service key, server-only).
Front end is under way: `app/page.tsx`, `app/asset/[id]`, the rating audit, and `components/trova/*`.
Design is agreed on a canvas (17 screens, desktop + mobile) before each screen is built.

## API routes (backend; app is API-only until the front end is asked for)
- `GET /api/health` → `{ ok, methodVersion }`.
- `GET /api/cron/snapshot` → daily snapshot; requires `Authorization: Bearer CRON_SECRET`.
- `GET /api/portfolio?wallet=` (lib/portfolio.ts) → `PortfolioSummary`: holdings scored with v3.2,
  `betterVariant` + `closeCall`, cash (SOL/USDC/USDT), `otherTokens`, value-weighted
  overall/ownership/exit, needs-attention + speculative value, allocations, signals, warnings.
  PUBKEY only. Tested live: 8s for a normal wallet, 23s for the xStocks issuer wallet (1,254 tokens).
- `GET /api/asset/<assetId>` (lib/asset.ts) → `AssetDetail`: every variant ranked with its full score,
  instrument class + `redemptionNote`, the best pick (+ closeCall/runner-up), asset stats, change
  signals, and `reference` (Pyth first, else Backpack) with confidence + age + market-open.
  `gapPercent` = on-chain price vs reference, shown ONLY where units match (`comparable()`), and the
  reference carries a `basis`: **share** for stocks/ETFs (`Equity.US.<T>/USD`), **ounce** for metals
  (`Metal.XAU|XAG/USD`, entitled on the free Pyth plan). Spot metal tokens (kind `spot`: PAXG, XAUt0,
  GOLD, XAUM) are 1 troy ounce → comparable; metal ETF trackers (kind `etf`: GLDx, IAUon) follow a
  per-share ETF → no reference. Pre-IPO SPV exposure is never comparable. `privateMark` exposes the
  pre-IPO last private valuation vs the token-implied one. Unknown id → 404 (tokens.xyz 404 ≠ outage).
- `GET /api/signals?mints=&days=` (lib/signals.ts) → change events from snapshots. Structural
  changes (advisory/redemption/instrument class/tier) fire immediately; grade, tradability and
  market-health changes must hold 3 snapshots; method-version changes never fire a grade signal.

## Valuation rule (display only — price NEVER affects the score)
Dead variants keep quoting their last trade (CLSKx sat at $1,684 vs a real CLSK price of $12.60,
2026-09-15; RBLXx 107x; PYPLx 62x). So `valuePrice()`: use the variant's own price only when it has
liquidity AND traded in 48h AND is within 25% of the reference; else use Backpack's real stock price
(1:1 listed stocks/ETFs only — never per-ounce metals or private companies); else leave it UNPRICED
and exclude it from the total. Every fallback is disclosed as a `stale-price` signal.
Portfolio signals are aggregated past 3 of a kind (one wallet had 168 untradable holdings).

## Screens (match the published mock; light + dark; responsive desktop+mobile)
Connect (landing) → Portfolio (home: total, trust-score gauge, allocation,
signals, holdings w/ returns + de-risk) → Markets ("CoinGecko for stocks":
trending/curated/news, stocks+etfs+metals+treasuries) → Asset detail (price,
chart, About, ranked variants + the safety report, Buy/Sell) → Buy/Sell sheet →
Settings. Desktop = sidebar (collapsible) dashboard; mobile = bottom nav.

## Build order (cut from the bottom if behind; NEVER cut the loop)
1. Scaffold + providers (theme/wallet/query) + connect wallet.
2. Read holdings (Helius) → render Portfolio from real data.
3. tokens.xyz variants + Trova Score → Asset page ranked variants + report.
4. Jupiter quote/swap → Buy + De-risk executing on mainnet. ← DEMO-CRITICAL LOOP
5. Signals (drift/concentration/bot-heavy) + performance returns.
6. Markets + watchlist. 7. Recurring. (Backpack, Supabase, referral optional.)

## Files already provided
lib/types.ts, lib/trust-score.ts, lib/tokens-xyz.ts, .env.local.example. Build
the rest (helius.ts, jupiter.ts, portfolio.ts, api routes, components) to match.
