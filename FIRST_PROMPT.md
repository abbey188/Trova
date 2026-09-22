# First Claude Code prompts (run in order, in your empty repo)

Put CLAUDE.md, .env.local.example, and lib/ (types.ts, trust-score.ts,
tokens-xyz.ts) in the repo root first, then fill .env.local from the example.

## Prompt 1 — scaffold
"Read CLAUDE.md. Scaffold a Next.js 15 (App Router, TypeScript) app in this repo
with Tailwind, shadcn/ui, lucide-react, next-themes, @tanstack/react-query, and
Solana wallet-adapter (Phantom/Solflare/Backpack). Set up app/layout.tsx with
ThemeProvider → QueryClientProvider → ConnectionProvider/WalletProvider/
WalletModalProvider using NEXT_PUBLIC_HELIUS_RPC_URL. Fonts: Space Grotesk +
Plus Jakarta Sans. Add the design tokens from CLAUDE.md as CSS vars. Build the
Connect landing page. Don't touch lib/types.ts, lib/trust-score.ts,
lib/tokens-xyz.ts — they're canonical."

## Prompt 2 — read the portfolio
"Add lib/helius.ts (getParsedTokenAccountsByOwner incl. Token-2022) and
lib/portfolio.ts that: reads a wallet's mints+amounts, resolves them to
tokens.xyz assets, fetches each asset's variants, scores the held variant AND
the best routable variant (rankVariants), prices holdings via market-snapshots,
and returns PortfolioSummary (use lib/trust-score.ts). Expose GET
/api/portfolio?wallet=. Build the Portfolio dashboard page from CLAUDE.md's mock,
rendering real data; empty wallet → the connect/empty state."

## Prompt 3 — asset page + the safety report
"Add GET /api/asset/[id] returning ranked variants + scores. Build the asset
detail page: price, sparkline (ohlcv), About, and the ranked variant list where
each variant expands into its Trova Score breakdown (liquidity, execution,
redeemability, maturity) plus the factual 'organic vs bot volume' line from
botVolumeRatio. Mark the top routable variant 'Buy safest'; show tier3/thin ones
rejected with reason."

## Prompt 4 — the loop (demo-critical)
"Add lib/jupiter.ts (quote + swap, inject referral feeAccount/platformFeeBps
server-side) and POST /api/quote. Build BuySheet + SellSheet: get quote →
deserialize VersionedTransaction → wallet.signTransaction → send via Helius →
confirm → invalidate portfolio query → show Solscan receipt. De-risk = swap the
held variant into betterVariant.mint. Test on mainnet with small USDC."

## Then: signals, performance returns, Markets (stocks+etfs+metals+treasuries),
## watchlist, recurring — in that order. Deploy to Vercel; add Helius Allowed
## Origins at deploy.
