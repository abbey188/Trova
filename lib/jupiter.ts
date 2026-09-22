// Jupiter — the only place Trova touches execution. Quotes are read-only and need no key;
// a swap transaction is built here but signed by the user's wallet, never by us.
//
// quote-api.jup.ag/v6 is dead; lite-api.jup.ag/swap/v1 answers without an API key (tested
// 2026-09-22). Everything here fails soft: no route is an answer, not an error.

const BASE = "https://lite-api.jup.ag/swap/v1";
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
}

interface RawQuote {
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

// A 4xx with an error body is Jupiter answering "there is no route". A timeout, a network error or a
// 5xx is Jupiter not answering at all. Those are different facts and the UI says different things.
async function getJson(url: string): Promise<Fetched> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as RawQuote;
        if (body.error || !body.outAmount) return { ok: false, reason: "no-route" };
        return { ok: true, body };
      }
      if (res.status >= 400 && res.status < 500) return { ok: false, reason: "no-route" };
    } catch {
      // fall through to the retry
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, reason: "unavailable" };
}

/**
 * One quote. Returns null when Jupiter has no route at this size — which for a thin token is the
 * finding, not a failure. `withFee` adds the referral fee so a displayed quote matches what executes.
 */
export async function quote(
  inputMint: string,
  outputMint: string,
  rawAmount: string | number,
  opts: { slippageBps?: number; withFee?: boolean } = {},
): Promise<Quote | null> {
  const r = await quoteDetailed(inputMint, outputMint, rawAmount, opts);
  return r.ok ? r.quote : null;
}

/** Same quote, but says WHY there is no answer. */
export async function quoteDetailed(
  inputMint: string,
  outputMint: string,
  rawAmount: string | number,
  { slippageBps = 50, withFee = false }: { slippageBps?: number; withFee?: boolean } = {},
): Promise<{ ok: true; quote: Quote } | { ok: false; reason: "no-route" | "unavailable" }> {
  const params = new URLSearchParams({
    inputMint, outputMint, amount: String(rawAmount), slippageBps: String(slippageBps),
  });
  if (withFee) {
    const { platformFeeBps } = referral();
    if (platformFeeBps) params.set("platformFeeBps", String(platformFeeBps));
  }
  const fetched = await getJson(`${BASE}/quote?${params}`);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteResponse: q, userPublicKey, wrapAndUnwrapSol, ...(feeAccount ? { feeAccount } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { swapTransaction?: string };
    return body.swapTransaction ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
