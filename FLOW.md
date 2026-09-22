# Trova — app flow

Written for whoever builds or reviews the screens. Every page, every button, every
state, derived from data we actually hold. Where we can't support something, it says so.

Companion docs: `SPEC.md` (what the product is), `CLAUDE.md` (stack + engine rules),
`FLOW.md` (this — how it behaves).

---

## 1. What we are actually offering

Before layout: the list of analyses we can put on a screen. Anything not on this list
does not get designed, because we cannot source it.

### Per token (variant)

| We show | Where it comes from | Already built |
|---|---|---|
| Trova Score 0–100 + grade A–D / NR | `lib/trust-score.ts` | yes |
| **What you own** (Structure) and its two parts | redemption right 70%, product rights 30% | yes |
| **Can you get out** (Market health) and its four parts | liquidity, activity, holders, execution quality | yes |
| Confidence high/med/low | how many inputs the issuer actually reports | yes |
| Instrument class | share-redeemable, cash tracker, non-redeemable, pre-IPO SPV, leveraged | yes |
| Tradable or not, and why not | liquidity ≥ $50k, traded in 24h, no advisory | yes |
| **Cost to leave, measured** | Jupiter round-trip quote at the user's size | **no — needs `lib/jupiter.ts`** |
| Price, 24h change | tokens.xyz `market` | yes |
| Gap vs real-world price | Pyth first, else Backpack, only where units match | yes |
| Bot share of volume | `executionQuality.botVolumeRatio` — shown as a fact, never scored | yes |
| Advisory warnings | tokens.xyz `advisory` | yes |
| Liquidity tier 1/2/3 | neutral depth label, never scored | yes |
| Issuer confirmed | mint present in Backpack's own asset list | yes |
| **Logo** | `market.logoURI` on every variant | data yes, **unused in UI** |
| **Price history** | tokens.xyz `ohlcv`, Backpack `klines` for the real stock | data yes, **unused in UI** |

### Per company / asset

Ranked variants · best pick · close call when the top two are within 5 points ·
aggregate liquidity, volume, holders · reference price with basis (per share or per
troy ounce) · US market open/closed · last private mark vs token-implied valuation for
private companies · change signals from daily snapshots.

### Per portfolio

Total value under the valuation rule (dead quotes excluded) · value-weighted score and
both pillars · value needing attention · value in speculative instruments · allocation
by instrument class, by grade, by tier · per holding: value, better variant available,
stale-price flag · cash · tokens outside our universe · what changed.

### Discovery

Curated lists (stocks, ETFs, metals, RWAs) · trending · search.

### What we cannot show — do not design these

Dividend payments or yield · earnings, P/E, revenue, any fundamental · analyst ratings
or price targets · corporate actions · tax lots or cost basis (we see balances, not
purchase history, so **"return %" is only available for positions bought inside Trova**).

**On dividends specifically.** We can answer *"does this token entitle you to dividends
at all?"* — that is part of product rights, and it is why a pre-IPO SPV scores 0 there.
We cannot answer *"what did it pay?"*. The screens say the former and never imply the latter.

---

## 2. The one loop

Everything below serves three moves, in this order:

1. **See what you hold** and whether any of it is a problem.
2. **Understand why** a rating says what it says.
3. **Act** — buy the sound one, or leave the broken one.

A screen that doesn't serve one of these doesn't ship this week.

---

## 3. Navigation

### Desktop (≥1024px)

Left rail, collapsible, 4 items: **Home · Markets · Activity · Method**.
Top bar: search (⌘K), theme toggle, **avatar** → profile menu.

### Mobile (<768px)

Bottom tab bar, 4 tabs: **Home · Markets · Activity · Profile**.
No rail. Search is a header action inside Markets. Primary action on each screen is a
sticky bottom button above the tab bar.

Mobile is not the desktop layout reflowed. Desktop is a dashboard — several panels at
once. Mobile is a stack — one question per screen, everything else behind a tap.

---

## 4. States the whole app must handle

| State | Trigger | Behaviour |
|---|---|---|
| **No wallet** | first visit | Demo portfolio, badged "Demo". Header says "Welcome" with no name. All read-only screens work. Any action button becomes "Connect wallet". |
| **Connected** | wallet approved | Real holdings. Header says "Welcome back, {nickname}". |
| **No nickname yet** | first connect | One prompt: "What should we call you?" — skippable. Stored in the browser only, never sent anywhere. |
| **Connected, no holdings** | empty wallet | Not an error. "Nothing here yet" + the demo portfolio offered as a preview + Markets CTA. |
| **Loading** | any fetch | Skeletons in the real layout. Never a spinner over the page. |
| **Source degraded** | one API down | The page renders; a quiet strip names what's missing. Never a crash, never a blank. |
| **Unpriced holding** | dead quote, no reference | Row shows "—" and an info chip. Excluded from the total. |
| **Not tradable** | liquidity/route fails | Red. The only place red is used. |

**Demo mode rule.** The demo portfolio is a fixed, labelled sample wallet. Its badge is
always visible. Connecting swaps it for the real one with no layout change, so the user
sees the same product either way.

---

## 5. Screens

### 5.1 Landing — `/`

Only shown when no wallet is connected and the user has not chosen to browse.

**Desktop.** Left: tagline, one paragraph, two buttons. Right: one live proof card —
two tokens for the same company, one A, one with no way out. This card uses real data.

**Mobile.** Logo. Tagline. **One** line of explanation. Two buttons. Nothing else.

> Know what you own
> The same stock exists as several tokens on Solana. Only some of them can be sold.

| Button | Does |
|---|---|
| **Connect wallet** (primary, lime) | Wallet Standard picker → approve → nickname prompt → Home |
| **Browse markets** (secondary) | Markets in demo mode, no wallet |

### 5.2 Home — `/`

The portfolio. The screen we are judged on.

**Order on mobile, top to bottom:**

1. **Header** — avatar, "Welcome back, {nickname}", demo badge if demo. Avatar → profile.
2. **Value** — total, big, tabular. Delta below it. Sparkline of portfolio value behind/under the number.
3. **Score ring** — circular gauge, grade + number in the centre, two thin pillar arcs. Tap → the rating explainer sheet.
4. **Attention button** — a pill with a count badge: `⚠ 3`. Tap → sheet listing what and why. Not a list on the page.
5. **Allocation donut** — by instrument class. Tap a segment → filters the holdings list below.
6. **Holdings** — one row each: logo, symbol, sparkline, value, grade pill. Tap → asset.
7. **Recent changes** — 2 rows max, then "See all".

**Desktop** shows the same content as panels: value + ring in a hero row, allocation and
attention beside it, holdings as a table with a sparkline column.

| Button | Does |
|---|---|
| Avatar | Opens profile sheet |
| Score ring | Explainer sheet: the two pillars in plain words, link to Method |
| `⚠ n` attention | Sheet: each item, one line, with the fix ("TSLAx is the sound one" → asset) |
| Donut segment | Filters holdings |
| Holding row | → Asset detail |
| Sort / filter | Sorts holdings by value, grade, or cost-to-exit |
| See all changes | → Activity |
| Connect wallet (demo only) | Wallet picker |

**Portfolio sparkline honesty.** We do not store wallet history. The line is today's
holdings priced backwards through `ohlcv`, labelled "modelled from current holdings".
It is not a record of what the wallet was worth.

### 5.3 Markets — `/markets`

Discovery. Looks like a place you browse, not a spreadsheet.

1. Search field (or header icon on mobile).
2. Segments: **Stocks · ETFs · Metals · Private companies**.
3. **Trending** — horizontal strip of logo tiles with 24h change. Tap → asset.
4. List rows: logo, name + ticker, price, 24h %, sparkline, grade pill of the *best*
   token for that company.

Sorted by the rating of the best token, never by price or 24h change. One line at the
bottom of the list says so — the only explanatory text on the screen.

| Button | Does |
|---|---|
| Search | Filters live; empty state suggests trending |
| Segment | Switches asset class |
| Trending tile / list row | → Asset detail |
| Sort control | Rating (default), liquidity, 24h change, name |
| Watchlist star | Pins to the top. Stored locally. *(cut if short on time)* |

### 5.4 Asset detail — `/asset/[id]`

**Above the fold:** logo, company name, ticker, price, 24h change, and the chart.
The chart is the real price history with a range selector — **1D · 1W · 1M · 3M · 1Y**.

Then **one** card: *The sound one to hold* — logo, symbol, grade ring, the two pillar
bars, liquidity and holders as figures, and a **Buy** button.

Then a collapsed row: **`Other tokens for this company (4)`** with a stack of their
logos and their grade pills. Tap to expand into the ranked list. Untradable ones show
the red "no way out" state when expanded.

Then: reference price chip · About (from tokens.xyz) · aggregate stats · what changed.

| Button | Does |
|---|---|
| Range selector | Redraws chart from `ohlcv` |
| **Buy** (sticky on mobile) | → Buy sheet, best token pre-selected |
| Other tokens (n) | Expands the ranked list in place |
| Why this rating | → Rating audit |
| Reference chip | Tooltip: source, age, basis, and that price never affects the score |
| Watchlist | Toggles |

### 5.5 Rating audit — `/asset/[id]/rating/[mint]`

Where the numbers are proved. Built already; to be re-skinned to the new rules.

Two pillar blocks, each component with its weight and the raw input behind it, then
`√(S × M)`, confidence, and what would move it. Every paragraph that currently sits on
the asset page lives here instead.

| Button | Does |
|---|---|
| Back | → Asset |
| How we score | → Method |
| Compare with {other token} | Side-by-side of the two audits |

### 5.6 Buy / Sell sheet

Bottom sheet on mobile, centred modal on desktop.

1. Token picker — best pre-selected, alternatives listed with grade pills.
2. Amount, with 25/50/max chips.
3. Quote: **you get**, price impact, route, max slippage.
4. **Cost to leave again** — measured by quoting the sale back at the same size.
5. Confirm → wallet signature.

| Button | Does |
|---|---|
| Token row | Switches the quote |
| Amount chips | 25% / 50% / Max of USDC balance |
| **Review in your wallet** | Builds the swap, requests the signature |
| Cancel / close | Back, nothing signed |

**Blocked state.** If the chosen token isn't routable, the sheet does not show a quote.
It shows why, offers the sound token instead, and keeps a secondary "continue anyway".
This is the demo's best moment — an app that refuses to sell you something you couldn't
get out of.

### 5.7 Activity — `/activity`

A feed you scroll. Grouped by day, newest first.

Rows: dot (colour = severity), logo, one sentence, timestamp. Rows for tokens the user
holds carry a "You hold this" chip and sort first.

Filter chips: **All · Your holdings · Structure · Tradability**.

| Button | Does |
|---|---|
| Filter chip | Filters the feed |
| Row | → the asset it concerns |
| Expand grouped row | Opens the n tokens folded into one entry |

### 5.8 Profile sheet

Opened from the avatar. Not a page.

Nickname (editable) · address with copy · connected wallet · theme toggle ·
links to Method and FAQ · **Disconnect**.

### 5.9 Method — `/method`

Every explanation in the product lives here: the two pillars, the grades and cutoffs,
why price never counts, what "speculative" means, the missing-data rule, how often we
rescore, and what we can't tell you (§1). Linked from the score ring, the audit page and
the profile sheet.

This page is allowed to be text. No other screen is.

---

## 6. Rules the design must follow

1. **A grade never appears without its number.** ~20% of letters sit near a cutoff.
2. **Red means one thing:** you cannot get out. Never for a price falling.
3. **Speculative is always labelled**, in lists, holdings, asset pages and buy sheets.
4. **Explanation is a tap, not a paragraph.** One line max on a card; the rest behind
   the audit or Method.
5. **Every company shows its logo.** `market.logoURI`, with a lettermark fallback.
6. **Every price shows its history.** Sparkline in lists, full chart on the asset page.
7. **Counts are buttons.** "3 need attention" is a pill with a badge, not a list.
8. **Numbers are tabular and in the display face.** Labels are small and quiet.
9. **Mobile has one primary action per screen**, sticky, thumb-reachable, ≥44px.
10. **Nothing is predictive.** No targets, no "buy this", no implied performance.

---

## 7. Build order against Friday

1. Logos + sparklines into the existing asset page — biggest visual gain, data already there.
2. Home / Portfolio screen (both widths) with ring, attention pill, donut, holdings.
3. `lib/jupiter.ts` → Buy sheet with the real quote and the blocked state.
4. Activity feed from the 60 real signals.
5. Markets.
6. Method page.
7. Rating audit re-skin.

Cut from the bottom. Never cut 1–3 — that is the loop.
