// GET /api/quote?inputMint=&outputMint=&amount=<raw base units>&slippageBps=50
//
// What the buy and swap sheets show before anything is signed: what you pay, what you get, the
// route, and — the part no other front end shows — what it would cost to leave again at this size,
// measured by quoting the sale straight back. Read-only; nothing here asks for a signature.

import { getMintDecimals, isSolanaAddress } from "@/lib/helius";
import { quoteDetailed } from "@/lib/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_RAW = 2n ** 64n - 1n;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const inputMint = p.get("inputMint") ?? "";
  const outputMint = p.get("outputMint") ?? "";
  const amountRaw = p.get("amount") ?? "";
  const slippageBps = Number(p.get("slippageBps") ?? 50);

  if (!isSolanaAddress(inputMint) || !isSolanaAddress(outputMint)) {
    return Response.json({ error: "inputMint and outputMint must be Solana addresses." }, { status: 400 });
  }
  if (inputMint === outputMint) {
    return Response.json({ error: "inputMint and outputMint must differ." }, { status: 400 });
  }
  if (!/^\d{1,20}$/.test(amountRaw) || BigInt(amountRaw) <= 0n || BigInt(amountRaw) > MAX_RAW) {
    return Response.json({ error: "amount must be a positive integer in base units." }, { status: 400 });
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1_000) {
    return Response.json({ error: "slippageBps must be an integer from 1 to 1000." }, { status: 400 });
  }

  try {
    const [leg, decimals] = await Promise.all([
      quoteDetailed(inputMint, outputMint, amountRaw, { slippageBps, withFee: true, fresh: true }),
      getMintDecimals([inputMint, outputMint]).catch(() => new Map<string, number>()),
    ]);
    const ui = (raw: string, mint: string) => {
      const d = decimals.get(mint);
      return d == null ? null : Number(raw) / 10 ** d;
    };

    if (!leg.ok) {
      // "no-route" is a finding about the token; "unavailable" is about Jupiter. Never conflate them.
      return Response.json({ status: leg.reason, inputMint, outputMint, amount: amountRaw });
    }
    const q = leg.quote;

    // Cost to leave again: quote the sale straight back at the size just bought.
    const back = await quoteDetailed(outputMint, inputMint, q.outAmount, { slippageBps });
    const leaveAgain = back.ok
      ? {
          status: "ok" as const,
          backAmount: back.quote.outAmount,
          backUi: ui(back.quote.outAmount, inputMint),
          roundTripPct: (Number(BigInt(amountRaw) - BigInt(back.quote.outAmount)) / Number(amountRaw)) * 100,
          routeLabels: back.quote.routeLabels,
        }
      : { status: back.reason, backAmount: null, backUi: null, roundTripPct: null, routeLabels: [] };

    return Response.json({
      status: "ok",
      inputMint,
      outputMint,
      inAmount: q.inAmount,
      outAmount: q.outAmount,
      inUi: ui(q.inAmount, inputMint),
      outUi: ui(q.outAmount, outputMint),
      priceImpactPct: q.priceImpactPct,
      routeLabels: q.routeLabels,
      slippageBps: q.slippageBps,
      leaveAgain,
      quotedAt: Date.now(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("quote failed", e);
    return Response.json({ status: "unavailable", error: "Quotes are temporarily unavailable." }, { status: 502 });
  }
}
