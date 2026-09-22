# Trova — project brief for Claude Code

Trova is a **trust-first portfolio manager for tokenized assets on Solana**
(stocks first; also ETFs, metals, treasuries). It reads a user's wallet, ranks
every on-chain variant of an asset by a **Trova Score**, shows which one is the
safest/verified option, and lets them buy / swap / de-risk into it via Jupiter.
Hackathon: Stocklana (Solana Foundation), deadline Fri 18 Sep 4pm ET.

## The one thing that makes Trova different
When you buy/sell, you don't just get a price — you get a **safety report**:
which variant is safest and *why*, from live monitoring. Same asset often has
multiple variants at different trust tiers (e.g. Tesla: xStocks TSLAx = tier2,
deep; Ondo TSLAon = tier3, thin). We always steer to the safest routable one.

## Non-negotiable principles
1. Reading the portfolio uses only the wallet PUBKEY — never a signature.
   Signatures happen only on an action (buy/swap/de-risk/recurring).
2. Trust tier is a HARD CAP on the score, never just a weight.
3. Factual only — never predictive / never "buy this, it'll go up".
4. Secrets stay in Route Handlers (`TOKENS_XYZ_API_KEY` etc.). Only the
   domain-restricted RPC + Supabase anon/URL are `NEXT_PUBLIC_`.
5. Asset-class-agnostic engine; DEMO stocks. Mainnet only (Jupiter has no
   devnet aggregator; xStocks/Ondo are mainnet-only).
6. Degrade, don't crash — any single data source can be missing.

## Stack
Next.js 15 (App Router) + TS · Tailwind + shadcn/ui + lucide-react ·
next-themes · Recharts + inline-SVG sparklines · TanStack Query ·
@solana/wallet-adapter (Phantom/Solflare/Backpack) · @solana/web3.js + Helius
RPC (mainnet) · Next.js Route Handlers · Supabase (optional MVP) · Vercel.
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
- **Helius RPC**: read token accounts (getParsedTokenAccountsByOwner, incl.
  Token-2022) + send signed txns.
- **Backpack** (public, no auth): OPTIONAL enhancement — order-book depth +
  market-sessions (NAV-drift flag). Not required for MVP.

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

## The Trova Score (see lib/trust-score.ts — already written)
Per-variant 0..100, tier is a hard cap (tier1 100 / tier2 80 / tier3 45):
liquidity 35% (log of market.liquidity) + execution 30% (executionScore minus
botVolume penalty) + redeemability 20% (stockVariantTier) + maturity 15%
(holders + trades). Reject gate: tier3 OR liquidity < $50k. `isEligibleForPrimary`
boosts ranking. Portfolio trust score = value-weighted avg; "$ at risk" = value
in holdings scoring < 60. The safety REPORT = these components shown factually
(incl. "organic vs bot volume" from botVolumeRatio).

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
