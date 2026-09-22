# Trova — product and build spec

**Insights, analytics, trading and portfolio management for tokenized assets on Solana.**
Stocks first, plus ETFs and metals.

> **Know what you own — and whether you can get out.**

Status: backend complete and deployed · front end in progress · Stocklana hackathon, due **Fri 25 Sep 2026**.
Live: https://trova-virid.vercel.app · scoring method **v3.2**.

---

## 1. The problem

The same stock exists on Solana several times over, issued by different people, and the differences are
invisible at the point of purchase. Tesla has two tokens; SpaceX has five. They are not equivalent:

| Token | Issuer | What you'd own | Can you sell it? |
|---|---|---|---|
| SPCX | Backpack Securities | Redeemable for the share | Yes — 0.2% to exit |
| SPCXx | Backed | Redeemable for cash value | Yes — 0.2% to exit |
| SPACEX | PreStocks | SPV exposure, no ownership rights | Yes, thin |
| SPCXon | Ondo | Redeemable for cash value | **No — not tradable** |

Three further facts we measured on live data (15–16 Sep 2026):

- **Prices lie when a token stops trading.** CLSKx was quoting **$1,684** against a real CleanSpark price
  of **$12.60**. RBLXx was 107× off, PYPLx 62×. A portfolio priced naively read **$5.4M** instead of $77k.
- **Some positions cannot be exited at all.** TSLAon ($145k liquidity, 42 trades/day) has no route on any
  venue Jupiter reaches. AAPLon costs **22.9%** to sell $500. SPCXon returns `TOKEN_NOT_TRADABLE`.
- **Market-only risk scores miss the point.** tokens.xyz rates PreStocks' OpenAI token **"A / Established"**.
  It is SPV exposure to a private company conferring no ownership, voting, dividend or information rights.

## 2. What Trova offers

Three things, one loop: **manage what you hold → be warned before you buy → open any rating and see why.**

1. **A portfolio that knows what you actually hold.** Connect a wallet (public key only, never a signature).
   Every position gets a rating, the cost to leave it, and a flag if it can't be left at all.
2. **A safety report before you buy.** For any asset, every variant ranked, with the sound one named and the
   rejected ones explained in plain words.
3. **A rating you can audit.** Every score opens into its inputs and arithmetic. Published method, versioned.
4. **Alerts when something changes.** Daily snapshots of the whole universe; you're told when a rating,
   a redemption right, an advisory or a token's tradability moves.

### What Trova is not
No price predictions, no "buy this" — factual statements only. No invented history: we have no cost basis,
so we show no performance chart. No news feed or generic charting; anything we'd pass through untouched is
not our product.

---

## 3. The Trova Score (v3.2)

Ratings are **A / B / C / D**, or **NR** when the data is too thin to score honestly.

### Step 1 — classify the instrument
What you'd legally own, decided before any scoring: `direct-share` · `backed-tracker` ·
`non-redeemable-listed` · `unreported` · `leveraged` · `pre-ipo-exposure`.

Pre-IPO/SPV exposure is detected from four independent signals (pricing source, `pre-*` asset ids, issuer
and tags, Tessera's naming convention) and is **always labelled Speculative**. It also catches wrappers that
outlive an IPO — SpaceX is listed now, but PreStocks' SPACEX token is still SPV exposure.

No class is capped. A pre-IPO token grades D because the rubric scores its rights at zero, so if it ever
gained a redemption path it would score higher on its own.

### Step 2 — two pillars, shown separately
| Pillar | Question | Inputs |
|---|---|---|
| **Structure** | *What do I actually own?* | Redemption right 70% (share 100 / cash 75 / unreported 50 / none 30) + product rights 30% (full 100 / leveraged 40 / SPV 0) |
| **Market health** | *Can I get in and out?* | Mean of liquidity, activity (trades + volume), holders, and execution quality when reported |

Market health is scored against **fixed calibration anchors** — quantiles of the tradable universe, where 50
is the median — so a variant's score moves only when *it* moves, which is what makes day-to-day comparison
meaningful.

### Step 3 — combine
**Trova Score = √(Structure × Market).** A geometric mean, so neither half can hide the other: perfect
redemption with a dead market still fails, and vice versa.

Worked example, TSLAx (measured 16 Sep):

```
Structure  0.7 × 75 (cash-redeemable) + 0.3 × 100 (full exposure)        = 83
Market     mean(93 liquidity $3.45M, 86 activity 20,520 trades/$2.32M,
                93 holders 39,745, 85 execution)                          = 89
Score      √(83 × 89) = 86  →  grade A (cutoff 80)
```

### Guardrails
- **Advisories are the only hard caps** (caution 50 / compromised 15 / blocked hidden). SILV currently carries
  "Do not interact with the SILV contract…" and is capped at 15.
- **Borderline** — within 3 points of a cutoff, shown as "A 83 · borderline A/B". Under ±50% weight
  perturbation ~20% of letters move, so a letter is never shown alone.
- **Confidence** (high/medium/low) reflects how many inputs were reported. Missing data is uncertainty, not risk.
- **Missing-data rule** — an unreported redemption takes the most conservative value reported by same-class
  peers (pre-IPO → not redeemable), so silence never beats an explicit answer.
- **Close call** — if the best and second variants are within 5 points, both are shown and neither is called best.
- **Price never affects a score.** Prices, gaps and bot share are displayed as facts only.

### Method assurance
Built to composite-indicator practice (OECD/JRC): correlated indicators merged into one factor,
non-compensatory aggregation, fixed calibration, weight-sensitivity testing. Rankings hold at **0.98 median
rank correlation** under ±50% weight changes. **49 automated checks** pin the behaviour
(`pnpm verify`), and every score carries its `methodVersion`.

---

## 4. Valuation: refusing to quote a dead price

A variant's own price is used **only** if it has liquidity, traded within 48h, and sits within 25% of the
real-world reference. Otherwise Trova falls back to the real stock price (Pyth first, then Backpack), and if
no valid reference exists the holding is left **unpriced and excluded from the total**. Every fallback is
disclosed to the user.

On a live wallet: 56 holdings priced from their own market, 37 from a reference, 6 unpriced.

## 5. Cost to exit

Before showing an "upgrade", Trova quotes the real trade through Jupiter at the user's own size:

| Move | Rating change | $500 | $5,000 |
|---|---|---|---|
| SPCXx → SPCX | A 86 → A 97 | 0.29% | 0.30% |
| HOOD → HOODx | B 67 → A 84 | 1.90% | 2.03% |
| INTCx → INTC | C 62 → B 68 | 1.47% | 2.95% |
| MUx → MU | D 39 → A 91 | 4.70% | **8.83%** |
| TSLAon → TSLAx | — | **no route** | no route |

Two findings shape the product here. First, the cost is almost entirely the **exit** leg (MUx: 8.74% out,
0.00% in) — you pay to escape the bad token, not to enter the good one. Second, **Market health predicts the
exit cost**: 89 → 0.0%, 18 → 8.7%, 5 → no route. The score is a forecast of what leaving will cost.

Routing through USDC in two steps is the same price or worse (Jupiter already routes that way internally),
so upgrades execute as one swap, with "sell to USDC" offered separately for people who just want out.

---

## 6. Change tracking

Every day the whole universe is snapshotted — score, both pillars, grade, tier, redemption, advisory,
liquidity, holders — **plus the raw inputs**, so history can be re-scored when the method changes.

Signals fire on: advisory added/cleared · redemption change · instrument-class change · tier change ·
grade change · tradability change · market-health shift. Structural changes fire immediately; noisy ones
(grade, tradability, market health) must **hold for three consecutive snapshots**, and a method-version
change never fires a grade signal.

**Evidence it works** (as of 20 Sep, 5 days of history, 557–561 variants/day, zero failed runs): **36 signals
have fired on real market movement**, including:

- `AAPLon` grade **C → D**, held three snapshots — and separately lost tradability (liquidity fell under $50k)
- `GOOGLon` **C → D**, same story
- `MRVL` **B → C**; `JPMx` **C → D**
- `IEMGon`, `IEFAon`, `TBLLx` fell to **NR** — no longer enough reported data to rate
- `GEon`, `FIGon`, `NOWon` stopped trading entirely

---

## 7. Architecture

```
Next.js 15 (App Router, TS) · Tailwind v4 + shadcn/ui (Radix) · Hugeicons · next-themes · TanStack Query
Solana Kit (@solana/kit 8 + kit-plugin-wallet, Wallet Standard) · Vercel · Supabase
```

| Source | Role |
|---|---|
| **tokens.xyz** | Variant discovery, market data, redemption tier, execution quality, advisories |
| **Pyth** | Reference prices with confidence + publish time. Two paths: on-chain price accounts via our own RPC (key-free, shard 1, ~20s old) and Hermes REST with an API key. Entitlement-aware — Hermes 403s a whole request if one feed is outside the plan |
| **Backpack** | Second source: real stock prices for 1,140 US listings, issuer confirmation via 1,158 Solana mints, CUSIPs, market hours |
| **Helius** | Wallet reads (`getTokenAccountsByOwner` across SPL + Token-2022) and transaction sends |
| **Jupiter** | Quotes and swaps — the only execution venue |
| **Supabase** | Daily snapshots + run log; public read, service-role writes |

**Server-side only**, with secrets confined to Route Handlers. Every source degrades independently: a failure
costs one card, never the page, and is reported in `warnings`.

### API
| Route | Returns |
|---|---|
| `GET /api/portfolio?wallet=` | Holdings scored, better-variant + close-call, cash, value-weighted pillars, needs-attention and speculative value, allocations, signals, warnings |
| `GET /api/asset/<assetId>` | Every variant ranked, best pick, instrument class, redemption note, reference price with confidence/age/market-open, price gap where units match 1:1, pre-IPO private mark, change signals |
| `GET /api/signals?mints=&days=` | Change events from snapshot history |
| `GET /api/cron/snapshot` | Daily snapshot (Vercel Cron, bearer-token protected) |
| `GET /api/health` | Liveness + method version |

Measured: portfolio 8s for a normal wallet, 23s for the xStocks issuer wallet (1,254 tokens); snapshot ~100s
for 441 assets / 561 variants.

### Core modules
`lib/trust-score.ts` (rating engine) · `lib/portfolio.ts` · `lib/asset.ts` · `lib/signals.ts` ·
`lib/snapshot.ts` · `lib/pyth.ts` · `lib/backpack.ts` · `lib/tokens-xyz.ts` · `lib/helius.ts` ·
`scripts/verify-scoring.ts` + `scripts/verify-signals.ts` (49 checks).

---

## 8. Screens

| Screen | Job |
|---|---|
| **Connect** | Wallet, or any address read-only, or a sample wallet |
| **Portfolio** | Holdings rated, both pillars, needs-attention, cost to exit, what can't be sold |
| **Asset** | Which token to hold and why; real price vs on-chain; exit cost per variant |
| **Rating** | The breakdown — components, inputs, arithmetic, what would change it |
| **Trade** | Buy / move / sell with the cost quoted before signing |
| **Changes** | What moved since yesterday |
| **Markets** | Where a purchase starts: assets ranked by what we know |
| **Settings** | Wallet, theme, published method, disclosures |

Design: Space Grotesk + Plus Jakarta Sans · lime `#C6F24E` for actions only · emerald/amber/red for grades ·
light and dark · desktop and mobile.

---

## 9. Build plan to 25 Sep

| Day | Work |
|---|---|
| 20–21 Sep | Exit-cost API; app shell (fonts, theme, providers, wallet); Portfolio on real data |
| 22–23 Sep | Asset page + rating breakdown; trade loop (buy / move / sell) on mainnet |
| 24 Sep | Changes, Markets, method page; dark mode, empty states, polish |
| 25 Sep | Rehearse and submit |

**Dependencies:** a funded wallet (~$20 USDC + ~0.02 SOL) for the live trade, and the daily cron continuing
to run.

## 10. Known limits

- **No cost basis or portfolio history** — returns and performance charts are out of scope, deliberately.
- **Choice is rare**: only ~14 of 400 assets have more than one tradable variant, so "pick the best variant"
  is a highlight, not the whole product.
- **Pyth's free plan covers 21 feeds** (TSLA/QQQ/VOO among equities, plus XAU/XAG). Other assets fall back to
  on-chain Pyth or Backpack. The token-vs-equity feed comparison needs a paid plan.
- **Market-health shift signals** need a 7-day baseline plus 3 days of persistence, so they begin firing ~26 Sep.
- **Vercel Hobby cron** guarantees the hour, not the minute.
- Ratings describe instruments and markets, not companies, and are **not investment advice**.
