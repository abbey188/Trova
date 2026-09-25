# Trova

**A safety rating for tokenized stocks on Solana.**

The same stock exists on Solana as several different tokens. On a price chart they look identical. They are not: some redeem for the real share, some pay its cash value, some give you exposure with no rights at all, and some cannot be sold at any real size. Trova tells you what you would actually own, and whether you can get back out — then lets you buy the soundest token, move out of a weak one, and sell, from your own wallet.

**Live:** [trovascore.vercel.app](https://trovascore.vercel.app) · **Method:** [trovascore.vercel.app/docs](https://trovascore.vercel.app/docs) · Built for **Stocklana** (Solana Foundation)

---

## Why this matters

Tokenized equity has failed its holders before, and the failures were about rights and exits, not prices:

- **FTX (2022).** FTX's site said its stock tokens could be redeemed for the underlying shares; its own terms said buyers had no claim to delivery of the underlying. When FTX collapsed, holders were stuck.
- **"OpenAI tokens" (2025).** OpenAI publicly stated that tokens sold under its name were *not* OpenAI equity — exposure through a special-purpose vehicle, issued without its approval.

Market-only risk scores miss this. tokens.xyz's own market score rates Tesla, SpaceX and OpenAI tokens alike as *A 100 / "Established"*, because all four of its inputs are market metrics. Trova shows it beside ours — never blended in — and adds the half they leave out: what you own.

## What Trova does

| | |
|---|---|
| **Rates every token** | ~560 tokenized stocks, ETFs, metals and private-company tokens, re-scored daily. Every rating shows its working. |
| **Reads your wallet** | Paste or connect a wallet: holdings, a value-weighted **Trova Portfolio Score**, what needs attention, and what selling each holding would return *right now*. |
| **Knows which one you hold** | Open a company from a holding and Trova leads with *your* token — and, if it isn't the soundest, the sounder one of the same company, side by side. |
| **Measures the exit** | "Cost to leave" is a real round trip quoted through Jupiter — buy, then sell straight back — not a model. |
| **Acts** | Buy, move from a weak token to a sound one, or sell back to USDC. One signature, from your own wallet. |
| **Watches for change** | Daily snapshots; a rating or tradability change must hold for three days before it alerts you. |

## The Trova Score

Two questions, asked of every token, and nothing else.

**Ownership — what do you own?**

| Component | Weight | Scoring |
|---|---|---|
| Redemption | 70% | Redeems for the share **100** · for its cash value **75** · not reported **50** (or the most conservative value its class reports) · not redeemable **30** |
| What it entitles you to | 30% | Full economic exposure **100** · leveraged **40** · pre-IPO / SPV exposure **0** |

**Exit — can you get back out?** The mean of liquidity (market depth), activity (trades and volume), holders, and fill quality (when reported). Each is scored against fixed calibration anchors taken from tradable tokens, so 50 means "the median tradable token".

**Combined:** `Trova Score = √(Ownership × Exit)` — multiplied, not averaged, so a busy market cannot hide that you own nothing, and perfect paperwork cannot hide a dead market.

| Grade | Score | |
|---|---|---|
| **A** | ≥ 80 | Strong on both halves |
| **B** | ≥ 65 | |
| **C** | ≥ 50 | |
| **D** | < 50 | |
| **NR** | — | Not rated: too little is reported to rate honestly |

- **A letter is never shown without its number.** Scores within 3 points of a cutoff are marked *borderline*.
- **The only caps** are tokens.xyz advisories: caution caps at 50, compromised at 15, blocked hides the token.
- **Price never enters the score.** Prices, price gaps and liquidity tier are shown as facts only.
- **Confidence** (high / medium / low) says how many key inputs are reported. Missing information lowers confidence; it never quietly improves a rating.
- **Tradable** means at least $50k of liquidity, traded in the last 24 hours, and no compromised or blocked advisory.
- **Speculative.** Pre-IPO / SPV tokens are always labelled *Speculative*, everywhere they appear, with the issuer's own caveat.

The full method — with worked examples — is at **[/docs](https://trovascore.vercel.app/docs)**.

## Principles

1. **Looking never needs a signature.** Reading a portfolio uses only the public address. A signature is asked for only when you trade.
2. **Trova never holds a key.** The server builds an unsigned transaction from a fresh quote; your wallet signs and sends it.
3. **Factual, never predictive.** No "buy this, it'll go up". Every rating says it updates as information becomes public.
4. **Secrets stay on the server.** API keys live in Route Handlers; the browser never calls tokens.xyz.
5. **Degrade, don't crash.** Any single data source can be missing; the page says what it doesn't know.

## Data sources

| Source | Used for |
|---|---|
| [tokens.xyz](https://tokens.xyz) | Variants, redemption terms, execution quality, liquidity, advisories, candles — the foundation of every rating |
| [Jupiter](https://jup.ag) | Quotes, measured cost to leave, swap transactions |
| [Pyth](https://pyth.network) | Reference prices for the real share or metal, with confidence and age |
| [Backpack](https://backpack.exchange) | Second source: real US stock prices and history, CUSIPs, market hours, issuer confirmation |
| Helius RPC | Reading token accounts (SPL + Token-2022, including scaled-UI-amount splits) and sending transactions |
| Supabase | Daily rating snapshots; per-device watchlist and profile |
| Wikipedia · Financial Modeling Prep | "About" text and company logos where tokens.xyz has none (credited on the page) |

## Architecture

- **Next.js 15** (App Router, TypeScript) on **Vercel**; Tailwind v4, shadcn/ui, TanStack Query.
- **Solana Kit** (`@solana/kit`, `@solana/kit-plugin-wallet`, `@solana/react`) with Wallet Standard — Phantom, Solflare, Backpack.
- **Scoring engine** in `lib/trust-score.ts`, explained in plain language by `lib/explain.ts`.
- **Daily snapshot** via Vercel Cron → `app/api/cron/snapshot`, stored with the raw inputs so history can be re-scored when the method changes.

| Route | Returns |
|---|---|
| `GET /api/portfolio?wallet=` | Scored holdings, portfolio score, what needs attention, sell quotes |
| `GET /api/asset/<id>` | Every token of a company, ranked, with its full rating and explanation |
| `GET /api/markets` · `/api/search?q=` | Every company, graded |
| `GET /api/signals` · `/api/history` | What changed, and the rating over time |
| `GET /api/exit?mint=` · `/api/quote` | Measured cost to leave · a quote with the sale straight back |
| `POST /api/swap` | An unsigned transaction for the wallet to sign |

## Run it locally

```bash
pnpm install
cp .env.local.example .env.local   # add TOKENS_XYZ_API_KEY, HELIUS_RPC_URL, Supabase keys
pnpm dev                            # http://localhost:3000
```

```bash
pnpm verify          # scoring rubric + change-signal checks
pnpm snapshot:dry    # score every token without writing
pnpm snapshot        # write today's snapshot to Supabase
```

Apply the SQL in `supabase/migrations/` to a Supabase project for snapshots, the watchlist and profiles. Without Supabase the app still runs; history and the watchlist say they are unavailable.

## Honest limits

- Ratings cover what tokens.xyz reports; where an issuer reports nothing, Trova says so and lowers confidence.
- Selling is to USDC for now.
- Mainnet only — Jupiter has no devnet aggregator, and tokenized stocks are mainnet-only.
- Nothing here is investment advice.
