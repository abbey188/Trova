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
// We quote through /swap/v1. The newer /swap/v2/order (api.jup.ag only) aggregates more routers,
// but measured head to head on 2026-09-22 it was 0.04–0.10% WORSE on TSLAx and SPCX, and it charges
// its own platform fee, so there is nothing to gain for measurement. If we ever move execution to
// v2 note that the referral parameters are renamed: `referralAccount` / `referralFee`, not
// `feeAccount` / `platformFeeBps`.

const KEY = process.env.JUPITER_API_KEY?.trim();
const BASE = KEY ? "https://api.jup.ag/swap/v1" : "https://lite-api.jup.ag/swap/v1";
const AUTH: HeadersInit = KEY ? { "x-api-key": KEY } : {};

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
}

/** Referral, from env. Without a fee account Jupiter is asked for no platform fee at all. */
export function referral(): { feeAccount?: string; platformFeeBps?: number } {
  const feeAccount = process.env.JUPITER_REFERRAL_ACCOUNT?.trim();
  const bps = Number(process.env.JUPITER_REFERRAL_FEE_BPS ?? 0);
  if (!feeAccount || !(bps > 0)) return {};
  return { feeAccount, platformFeeBps: Math.min(bps, 100) };
}

type Fetched = { ok: true; body: RawQuote } | { ok: false; reason: "no-route" | "unavailable" };

// Quotes move on market time, not page time — a minute-old exit cost is still true, and caching is
// what keeps us inside the rate limit.
const TTL_MS = 5 * 60_000;   // exit costs are stable minute to minute; the cache is the real rate-limit fix
const cache = new Map<string, { at: number; value: Fetched }>();
let backoffUntil = 0;


// Client-side pacing, sized to the measured window: spend the burst, then hold ~1/s. Cheaper than
// discovering the limit through 429s, and it keeps a page's quotes arriving steadily.
const BURST = 8;
const REFILL_MS = 1_100;
let tokens = BURST;
let lastRefill = Date.now();
let queue: Promise<void> = Promise.resolve();

async function takeToken(): Promise<void> {
  const now = Date.now();
  const gained = Math.floor((now - lastRefill) / REFILL_MS);
  if (gained > 0) {
    tokens = Math.min(BURST, tokens + gained);
    lastRefill = now;
  }
  if (tokens > 0) {
    tokens--;
    return;
  }
  const wait = REFILL_MS - ((now - lastRefill) % REFILL_MS);
  await new Promise((r) => setTimeout(r, wait));
  lastRefill = Date.now();
}

/** Serialise every outbound call through the pacer, so concurrent callers cannot burst past it. */
function paced<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(takeToken).then(fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
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
          ? { ok: false, reason: "no-route" }
          : { ok: true, body };
        cache.set(url, { at: Date.now(), value: out });
        return out;
      }
      if (res.status >= 400 && res.status < 500) {
        const out: Fetched = { ok: false, reason: "no-route" };
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
): Promise<{ ok: true; quote: Quote } | { ok: false; reason: "no-route" | "unavailable" }> {
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

export interface ExitCost {
  /** "ok" measured it, "no-route" means you could not get out at this size, "unavailable" means we
   *  could not reach Jupiter — which is NOT the same claim and must not be shown as one. */
  status: "ok" | "no-route" | "unavailable";
  /** What a round trip costs, as a percentage of the amount put in. */
  roundTripPct: number | null;
  /** True only when a round trip was actually quoted. */
  routable: boolean;
  /** Which leg failed, when one did. */
  blockedOn?: "in" | "out";
  routeLabels: string[];
  usdSize: number;
}

/**
 * What it costs to get into a token and back out at a given size, measured rather than estimated:
 * buy it with USDC, then quote selling the whole result back. Measured 2026-09-22 — TSLAx 0.05% at
 * $4,661, OPENAI 2.20% at $1,366, and CLSKx 99.99% at $504, because selling it returns seven cents.
 */
export async function exitCost(mint: string, usdSize: number, slippageBps = 100): Promise<ExitCost> {
  const size = Math.max(1, Math.round(usdSize));
  const empty: ExitCost = { status: "unavailable", roundTripPct: null, routable: false, routeLabels: [], usdSize: size };
  if (mint === USDC_MINT) return { ...empty, status: "ok", roundTripPct: 0, routable: true };

  const inLeg = await quoteDetailed(USDC_MINT, mint, size * 10 ** USDC_DECIMALS, { slippageBps });
  if (!inLeg.ok) return { ...empty, status: inLeg.reason, blockedOn: "in" };

  const outLeg = await quoteDetailed(mint, USDC_MINT, inLeg.quote.outAmount, { slippageBps });
  if (!outLeg.ok) return { ...empty, status: outLeg.reason, blockedOn: "out", routeLabels: inLeg.quote.routeLabels };

  const back = Number(outLeg.quote.outAmount) / 10 ** USDC_DECIMALS;
  return {
    status: "ok",
    roundTripPct: ((size - back) / size) * 100,
    routable: true,
    routeLabels: [...new Set([...inLeg.quote.routeLabels, ...outLeg.quote.routeLabels])],
    usdSize: size,
  };
}

/** Exit cost across several sizes — what the asset page shows as "what it costs to leave". */
export async function exitLadder(mint: string, sizes: number[] = [5_000, 50_000, 250_000]): Promise<ExitCost[]> {
  const out: ExitCost[] = [];
  for (const usd of sizes) out.push(await exitCost(mint, usd));
  return out;
}

export interface SellNow {
  status: "ok" | "no-route" | "unavailable";
  /** USDC you would receive for the whole position right now. */
  receivedUsd: number | null;
  /** How much of the position's value the sale gives up, in %. */
  lossPct: number | null;
  routeLabels: string[];
}

/**
 * What selling a position you ALREADY hold returns right now: the whole balance, one way, to USDC.
 *
 * For a holder this is the true number. A round trip (exitCost) also pays the buy leg, which in a
 * thin market dominates — TSLAon's $1,200 round trip costs 97.7%, but most of that is buying INTO
 * $39 of liquidity, which a holder never has to do. The asset page keeps the round trip; the
 * portfolio shows this.
 */
export async function sellNow(mint: string, rawAmount: bigint, valueUsd: number, slippageBps = 100): Promise<SellNow> {
  const empty: SellNow = { status: "unavailable", receivedUsd: null, lossPct: null, routeLabels: [] };
  if (mint === USDC_MINT) return { status: "ok", receivedUsd: valueUsd, lossPct: 0, routeLabels: [] };
  if (rawAmount <= 0n) return { ...empty, status: "no-route" };

  const leg = await quoteDetailed(mint, USDC_MINT, rawAmount.toString(), { slippageBps });
  if (!leg.ok) return { ...empty, status: leg.reason };
  const receivedUsd = Number(leg.quote.outAmount) / 10 ** USDC_DECIMALS;
  return {
    status: "ok",
    receivedUsd,
    lossPct: valueUsd > 0 ? Math.max(0, ((valueUsd - receivedUsd) / valueUsd) * 100) : null,
    routeLabels: leg.quote.routeLabels,
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
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/swap`, {
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
    if (!res.ok) {
      console.error("jupiter swap build failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const body = (await res.json()) as { swapTransaction?: string };
    return body.swapTransaction ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
