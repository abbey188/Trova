// Jupiter — the only place Trova touches execution. Quotes are read-only; a swap transaction is
// built here but signed by the user's wallet, never by us.
//
// Hosts and limits: lite-api.jup.ag is the keyless host, api.jup.ag takes an `x-api-key`.
// MEASURED on our own key, 2026-09-23: a bucket of 10 over a ~10-SECOND sliding window — so a burst
// of 10 and then about 1 request a second. That is the Free tier; keyless is half of it. Measuring
// exit cost costs two quotes per holding, so an unpaced portfolio burns the bucket in a second and
// then crawls on backoff. Hence a pacer, a cache, and 429 backoff that honours x-ratelimit-reset.
// developers.jup.ag/portal sells more (Developer is 10 req/s).
//
// TWO routes, and a measurement has to ask both. /swap/v1 routes through on-chain pools only.
// /swap/v2/order (api.jup.ag, key required) also asks market makers for a quote (router "jupiterz").
// Until 2026-10-12 we asked v1 alone, on the strength of a 2026-09-22 comparison of TSLAx and SPCX —
// two pool-filled tokens, where v1 is 0.04–0.10% better because v2 charges 10 bps. That missed every
// token whose liquidity is NOT in pools: measured 2026-10-11, a $50,000 round trip in TSLAon cost
// 98.8% on v1 and 0.47% on v2, and the same held for NVDAon, AAPLon and SPCXon. Ondo tokens are
// filled by market makers, and their pools are close to empty. The reverse also happens: for 72
// xStocks tokens v2 answered "Quote not available from market maker" while v1 found a pool. So
// `bestQuote` asks both and keeps the larger amount out. v2 also says when a token cannot be traded
// because the US market is shut, which is a fourth answer and must never be shown as a loss.
// Referral on v2 is `referralAccount` / `referralFee`, not `feeAccount` / `platformFeeBps`.

const KEY = process.env.JUPITER_API_KEY?.trim();
const BASE = KEY ? "https://api.jup.ag/swap/v1" : "https://lite-api.jup.ag/swap/v1";
const AUTH: HeadersInit = KEY ? { "x-api-key": KEY } : {};
const ORDER_BASE = KEY ? "https://api.jup.ag/swap/v2" : null;

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const TIMEOUT_MS = 8_000;

export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;             // raw base units
  outAmount: string;            // raw base units
  priceImpactPct: number;
  routeLabels: string[];        // e.g. ["TesseraV"] — the AMMs Jupiter routed through
  slippageBps: number;
  /** Jupiter's quoteResponse exactly as returned. /swap needs ALL of it (routePlan, otherAmountThreshold,
   *  swapMode, …) — passing our summary instead makes it refuse to build a transaction. */
  response: Record<string, unknown>;
}

interface RawQuote extends Record<string, unknown> {
  inputMint?: string; outputMint?: string; inAmount?: string; outAmount?: string;
  priceImpactPct?: string; slippageBps?: number; error?: string;
  routePlan?: { swapInfo?: { label?: string } }[];
  // /swap/v2/order only
  router?: string; swapType?: string; transaction?: string | null; requestId?: string;
}

/** Where the liquidity behind a quote sits: on-chain pools, or a market maker answering a request. */
export type Liquidity = "pools" | "market-maker";
/** Why there is no quote. "market-closed" is Jupiter saying the token does not trade while the US
 *  market is shut — a fact about the hour, not about the token's depth. */
export type NoQuote = "no-route" | "unavailable" | "market-closed";

/** Referral, from env. Without a fee account Jupiter is asked for no platform fee at all. */
export function referral(): { feeAccount?: string; platformFeeBps?: number } {
  const feeAccount = process.env.JUPITER_REFERRAL_ACCOUNT?.trim();
  const bps = Number(process.env.JUPITER_REFERRAL_FEE_BPS ?? 0);
  // A fee account Jupiter cannot find makes EVERY swap fail, so anything that is not a plausible
  // address (a placeholder left in an env file, say) switches referral off instead.
  if (!feeAccount || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(feeAccount) || !(bps > 0)) return {};
  return { feeAccount, platformFeeBps: Math.min(bps, 100) };
}

type Fetched = { ok: true; body: RawQuote } | { ok: false; reason: NoQuote };
const MARKET_CLOSED = /outside of market hours/i;

// Quotes move on market time, not page time — a minute-old exit cost is still true, and caching is
// what keeps us inside the rate limit.
const TTL_MS = 5 * 60_000;   // exit costs are stable minute to minute; the cache is the real rate-limit fix
const cache = new Map<string, { at: number; value: Fetched }>();
let backoffUntil = 0;


// Client-side pacing that matches the limit we MEASURED: at most 10 requests in any ~10-second
// sliding window. A token bucket (burst 8, then one per 1.1s) looked equivalent but is not — after
// its burst it keeps refilling while those 8 are still inside the window, so ~17 requests could
// land in one window and draw exactly the 429s the pacer existed to prevent. Under four concurrent
// pages that surfaced as "unavailable" exit-ladder rungs. So: remember when each request left, and
// never let more than WINDOW_MAX of them sit inside WINDOW_MS.
const WINDOW_MAX = 9;          // one under the measured 10, for clock skew between us and them
const WINDOW_MS = 10_500;
const sent: number[] = [];
let queue: Promise<void> = Promise.resolve();

async function takeToken(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
    if (sent.length < WINDOW_MAX) {
      sent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 5));
  }
}

/**
 * Take a slot in the window, then run. Only the slot-taking is serialised: chaining the queue on the
 * request itself made every call wait for the previous RESPONSE, so nothing ever ran in parallel
 * even with the window half empty.
 */
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const slot = queue.then(takeToken);
  queue = slot.catch(() => undefined);
  return slot.then(fn);
}

function cached(key: string): Fetched | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.value;
}


// A 4xx with an error body is Jupiter answering "there is no route". A timeout, a network error or a
// 5xx is Jupiter not answering at all. Those are different facts and the UI says different things.
async function getJson(url: string, { fresh = false }: { fresh?: boolean } = {}): Promise<Fetched> {
  // A quote that will be SIGNED must be fresh; a cached one is fine for measuring exit cost.
  const hit = fresh ? null : cached(url);
  if (hit) return hit;

  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = backoffUntil - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 3_000)));

    // The timeout starts when the request LEAVES the pacer, not when it joins the queue. Started
    // earlier, a request that waited its turn behind a burst would abort before it was ever sent
    // and read as "Jupiter unavailable" — a false outage produced by our own rate limiter.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res = await paced(() => {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        return fetch(url, { headers: AUTH, signal: controller.signal, cache: "no-store" });
      });

      if (res.status === 429) {
        // x-ratelimit-reset is the unix second at which one slot frees up.
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
        backoffUntil = reset > Date.now() ? reset : Date.now() + 1_000;
        continue;
      }
      if (res.ok) {
        const body = (await res.json()) as RawQuote;
        const out: Fetched = body.error || !body.outAmount
          ? { ok: false, reason: MARKET_CLOSED.test(body.error ?? "") ? "market-closed" : "no-route" }
          : { ok: true, body };
        cache.set(url, { at: Date.now(), value: out });
        return out;
      }
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => "");
        const out: Fetched = { ok: false, reason: MARKET_CLOSED.test(text) ? "market-closed" : "no-route" };
        cache.set(url, { at: Date.now(), value: out });
        return out;
      }
    } catch {
      // fall through to the retry
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, reason: "unavailable" };  // deliberately not cached
}

/**
 * One quote. Returns null when Jupiter has no route at this size — which for a thin token is the
 * finding, not a failure. `withFee` adds the referral fee so a displayed quote matches what executes.
 */
export async function quote(
  inputMint: string,
  outputMint: string,
  rawAmount: string | number,
  opts: { slippageBps?: number; withFee?: boolean; fresh?: boolean } = {},
): Promise<Quote | null> {
  const r = await quoteDetailed(inputMint, outputMint, rawAmount, opts);
  return r.ok ? r.quote : null;
}

/** Same quote, but says WHY there is no answer. */
export async function quoteDetailed(
  inputMint: string,
  outputMint: string,
  rawAmount: string | number,
  { slippageBps = 50, withFee = false, fresh = false }: { slippageBps?: number; withFee?: boolean; fresh?: boolean } = {},
): Promise<{ ok: true; quote: Quote } | { ok: false; reason: NoQuote }> {
  const params = new URLSearchParams({
    inputMint, outputMint, amount: String(rawAmount), slippageBps: String(slippageBps),
  });
  if (withFee) {
    const { platformFeeBps } = referral();
    if (platformFeeBps) params.set("platformFeeBps", String(platformFeeBps));
  }
  const fetched = await getJson(`${BASE}/quote?${params}`, { fresh });
  if (!fetched.ok) return fetched;
  const raw = fetched.body;
  return { ok: true, quote: {
    inputMint: raw.inputMint ?? inputMint,
    outputMint: raw.outputMint ?? outputMint,
    inAmount: raw.inAmount ?? String(rawAmount),
    outAmount: raw.outAmount!,
    priceImpactPct: Number(raw.priceImpactPct ?? 0),
    routeLabels: (raw.routePlan ?? []).map((r) => r.swapInfo?.label).filter((l): l is string => !!l),
    slippageBps: raw.slippageBps ?? slippageBps,
    response: raw,
  } };
}

export interface OrderQuote {
  inAmount: string;
  outAmount: string;
  liquidity: Liquidity;
  routeLabels: string[];
  /** Present only when a taker was given: the transaction for that wallet to sign, and the id
   *  Jupiter needs to execute it. */
  transaction: string | null;
  requestId: string | null;
}

/**
 * One quote from the order route, which asks market makers as well as pools. Without a taker it is a
 * quote only. Needs the API key; without one it answers "unavailable" and callers fall back to pools.
 */
export async function orderQuote(
  inputMint: string,
  outputMint: string,
  rawAmount: string | number,
  { taker, fresh = false }: { taker?: string; fresh?: boolean } = {},
): Promise<{ ok: true; quote: OrderQuote } | { ok: false; reason: NoQuote }> {
  if (!ORDER_BASE) return { ok: false, reason: "unavailable" };
  const params = new URLSearchParams({ inputMint, outputMint, amount: String(rawAmount) });
  if (taker) params.set("taker", taker);
  const fetched = await getJson(`${ORDER_BASE}/order?${params}`, { fresh: fresh || !!taker });
  if (!fetched.ok) return fetched;
  const raw = fetched.body;
  return { ok: true, quote: {
    inAmount: raw.inAmount ?? String(rawAmount),
    outAmount: raw.outAmount!,
    liquidity: raw.swapType === "rfq" || raw.router === "jupiterz" ? "market-maker" : "pools",
    routeLabels: (raw.routePlan ?? []).map((r) => r.swapInfo?.label).filter((l): l is string => !!l),
    transaction: raw.transaction ?? null,
    requestId: raw.requestId ?? null,
  } };
}

export interface BestQuote {
  outAmount: string;
  /** Which route produced it: the pool route (/swap/v1) or the order route (/swap/v2/order). */
  route: "pools" | "order";
  liquidity: Liquidity;
  routeLabels: string[];
  /** The pool route's own answer, when it had one — kept so a page can say what pools alone give. */
  pool: Quote | null;
}

/**
 * The better of the two routes for one leg. Both are asked, because neither contains the other:
 * market makers fill tokens whose pools are empty, and pools fill tokens no market maker quotes.
 * With no quote, "market-closed" wins over "no-route" (the order route is the one that knows), and
 * a route we could not reach leaves the answer "unavailable" rather than a false "no route".
 */
export async function bestQuote(
  inputMint: string,
  outputMint: string,
  rawAmount: string | number,
  { slippageBps = 50 }: { slippageBps?: number } = {},
): Promise<{ ok: true; quote: BestQuote } | { ok: false; reason: NoQuote }> {
  const [pool, order] = await Promise.all([
    quoteDetailed(inputMint, outputMint, rawAmount, { slippageBps }),
    orderQuote(inputMint, outputMint, rawAmount),
  ]);
  const poolQuote = pool.ok ? pool.quote : null;
  if (order.ok && (!poolQuote || BigInt(order.quote.outAmount) > BigInt(poolQuote.outAmount))) {
    return { ok: true, quote: { outAmount: order.quote.outAmount, route: "order", liquidity: order.quote.liquidity, routeLabels: order.quote.routeLabels, pool: poolQuote } };
  }
  if (poolQuote) {
    return { ok: true, quote: { outAmount: poolQuote.outAmount, route: "pools", liquidity: "pools", routeLabels: poolQuote.routeLabels, pool: poolQuote } };
  }
  // Without a key the order route was never asked, so its "unavailable" says nothing: pools decide.
  if (!ORDER_BASE) return { ok: false, reason: pool.ok ? "no-route" : pool.reason };
  const reasons = [pool.ok ? null : pool.reason, order.ok ? null : order.reason];
  return { ok: false, reason: reasons.includes("market-closed") ? "market-closed" : reasons.includes("unavailable") ? "unavailable" : "no-route" };
}

export interface ExitCost {
  /** "ok" measured it, "no-route" means you could not get out at this size, "unavailable" means we
   *  could not reach Jupiter — which is NOT the same claim and must not be shown as one — and
   *  "market-closed" means the token does not trade while the US market is shut. */
  status: "ok" | NoQuote;
  /** What a round trip costs, as a percentage of the amount put in. */
  roundTripPct: number | null;
  /** True only when a round trip was actually quoted. */
  routable: boolean;
  /** Which leg failed, when one did. */
  blockedOn?: "in" | "out";
  routeLabels: string[];
  usdSize: number;
  /** What filled the way OUT — pools or a market maker. Null when nothing was quoted. */
  liquidity: Liquidity | null;
  /** The same round trip through pools alone, when pools could quote it. For a market-maker-filled
   *  token this is the number Trova used to report, and it can be 200 times the real one. */
  poolsRoundTripPct: number | null;
}

/**
 * What it costs to get into a token and back out at a given size, measured rather than estimated:
 * buy it with USDC, then quote selling the whole result back, each leg on the better route.
 * Measured 2026-09-22 — TSLAx 0.05% at $4,661, OPENAI 2.20% at $1,366, and CLSKx 99.99% at $504,
 * because selling it returns seven cents. Measured 2026-10-11 — TSLAon 0.42% at $500 through a
 * market maker, against 12.8% through its pools.
 */
export async function exitCost(mint: string, usdSize: number, slippageBps = 100, { quick = false }: { quick?: boolean } = {}): Promise<ExitCost> {
  const size = Math.max(1, Math.round(usdSize));
  // Quick mode, for the daily job where quotes are the budget: the order route already searches
  // pools as well as market makers, so when it returns a cheap round trip there is nothing for the
  // pool route to add. Anything else — no quote, or a cost of 1% or more — is measured in full,
  // because that is exactly where the two routes have been seen to disagree.
  if (quick && mint !== USDC_MINT) {
    const buy = await orderQuote(USDC_MINT, mint, size * 10 ** USDC_DECIMALS);
    const sell = buy.ok ? await orderQuote(mint, USDC_MINT, buy.quote.outAmount) : null;
    if (buy.ok && sell?.ok) {
      const cost = ((size - Number(sell.quote.outAmount) / 10 ** USDC_DECIMALS) / size) * 100;
      if (cost < 1) {
        return {
          status: "ok", roundTripPct: cost, routable: true, usdSize: size, liquidity: sell.quote.liquidity, poolsRoundTripPct: null,
          routeLabels: [...new Set([...buy.quote.routeLabels, ...sell.quote.routeLabels])],
        };
      }
    }
  }
  const empty: ExitCost = { status: "unavailable", roundTripPct: null, routable: false, routeLabels: [], usdSize: size, liquidity: null, poolsRoundTripPct: null };
  if (mint === USDC_MINT) return { ...empty, status: "ok", roundTripPct: 0, routable: true };
  const pct = (rawBack: string) => ((size - Number(rawBack) / 10 ** USDC_DECIMALS) / size) * 100;

  const inLeg = await bestQuote(USDC_MINT, mint, size * 10 ** USDC_DECIMALS, { slippageBps });
  if (!inLeg.ok) return { ...empty, status: inLeg.reason, blockedOn: "in" };

  const outLeg = await bestQuote(mint, USDC_MINT, inLeg.quote.outAmount, { slippageBps });

  // Pools alone, for comparison. When the buy leg was filled by pools the sale of that same amount
  // through pools is already in hand; otherwise it is one more quote.
  let poolsRoundTripPct: number | null = null;
  const poolIn = inLeg.quote.pool;
  if (poolIn) {
    const poolOut = inLeg.quote.route === "pools" && outLeg.ok
      ? outLeg.quote.pool
      : await quote(mint, USDC_MINT, poolIn.outAmount, { slippageBps });
    if (poolOut) poolsRoundTripPct = pct(poolOut.outAmount);
  }

  if (!outLeg.ok) return { ...empty, status: outLeg.reason, blockedOn: "out", routeLabels: inLeg.quote.routeLabels, poolsRoundTripPct };

  return {
    status: "ok",
    roundTripPct: pct(outLeg.quote.outAmount),
    routable: true,
    routeLabels: [...new Set([...inLeg.quote.routeLabels, ...outLeg.quote.routeLabels])],
    usdSize: size,
    liquidity: outLeg.quote.liquidity,
    poolsRoundTripPct,
  };
}

/**
 * The exit ceiling at a threshold, as the bracket that was actually quoted: the largest size that
 * left for under `thresholdPct`, and the smallest size above it that did not. Nothing is modelled or
 * interpolated — "under 1% up to at least $50,000, over 1% by $250,000" is all a ladder can say.
 */
export function exitCeiling(ladder: Pick<ExitCost, "status" | "roundTripPct" | "usdSize">[], thresholdPct: number): { underUsd: number | null; overUsd: number | null } {
  const rungs = ladder.filter((r) => r.status === "ok" || r.status === "no-route").sort((a, b) => a.usdSize - b.usdSize);
  let underUsd: number | null = null;
  let overUsd: number | null = null;
  for (const r of rungs) {
    const under = r.status === "ok" && r.roundTripPct != null && r.roundTripPct < thresholdPct;
    if (under && overUsd == null) underUsd = r.usdSize;
    else if (!under && overUsd == null) overUsd = r.usdSize;
  }
  return { underUsd, overUsd };
}

/** Exit cost across several sizes — what the asset page shows as "what it costs to leave". */
export async function exitLadder(mint: string, sizes: number[] = [5_000, 50_000, 250_000]): Promise<ExitCost[]> {
  const out: ExitCost[] = [];
  for (const usd of sizes) out.push(await exitCost(mint, usd));
  return out;
}

export interface SellNow {
  status: "ok" | NoQuote;
  /** USDC you would receive for the whole position right now. */
  receivedUsd: number | null;
  /** How much of the position's value the sale gives up, in %. */
  lossPct: number | null;
  routeLabels: string[];
  /** What would fill the sale — pools or a market maker. */
  liquidity: Liquidity | null;
}

/**
 * What selling a position you ALREADY hold returns right now: the whole balance, one way, to USDC,
 * on the better of the two routes.
 *
 * For a holder this is the true number. A round trip (exitCost) also pays the buy leg, which in a
 * thin market dominates — TSLAon's $1,200 round trip costs 97.7%, but most of that is buying INTO
 * $39 of liquidity, which a holder never has to do. The asset page keeps the round trip; the
 * portfolio shows this.
 */
export async function sellNow(mint: string, rawAmount: bigint, valueUsd: number, slippageBps = 100): Promise<SellNow> {
  const empty: SellNow = { status: "unavailable", receivedUsd: null, lossPct: null, routeLabels: [], liquidity: null };
  if (mint === USDC_MINT) return { ...empty, status: "ok", receivedUsd: valueUsd, lossPct: 0 };
  if (rawAmount <= 0n) return { ...empty, status: "no-route" };

  const leg = await bestQuote(mint, USDC_MINT, rawAmount.toString(), { slippageBps });
  if (!leg.ok) return { ...empty, status: leg.reason };
  const receivedUsd = Number(leg.quote.outAmount) / 10 ** USDC_DECIMALS;
  return {
    status: "ok",
    receivedUsd,
    lossPct: valueUsd > 0 ? Math.max(0, ((valueUsd - receivedUsd) / valueUsd) * 100) : null,
    routeLabels: leg.quote.routeLabels,
    liquidity: leg.quote.liquidity,
  };
}

export interface SwapRequest {
  quote: Quote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}

/**
 * The unsigned swap transaction, base64. The wallet signs it — Trova never holds a key.
 * Returns null rather than throwing so a failed build degrades to "try again" in the UI.
 */
export async function swapTransaction({ quote: q, userPublicKey, wrapAndUnwrapSol = true }: SwapRequest): Promise<string | null> {
  const { feeAccount } = referral();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Counts against the same limit as quotes, so it takes a slot like everything else — and, as
    // with quotes, the timeout starts once the request leaves the queue, not while it waits.
    const res = await paced(() => {
      timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      return fetch(`${BASE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({
        quoteResponse: q.response,
        userPublicKey,
        wrapAndUnwrapSol,
        // Size the compute budget to the route and pay a capped priority fee, so a signed swap
        // actually lands on mainnet instead of expiring in a busy slot.
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 500_000, priorityLevel: "high" } },
        ...(feeAccount ? { feeAccount } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
      });
    });
    if (!res.ok) {
      console.error("jupiter swap build failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const body = (await res.json()) as { swapTransaction?: string };
    return body.swapTransaction ?? null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
