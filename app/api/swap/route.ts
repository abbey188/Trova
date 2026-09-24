// POST /api/swap { inputMint, outputMint, amount, slippageBps, userPublicKey }
//   → { swapTransaction } — an UNSIGNED transaction, base64.
//
// The only step in Trova that leads to a signature, and the signature happens in the user's wallet,
// never here: Trova holds no keys. The server re-quotes fresh rather than trusting a quote sent from
// the browser, so the transaction reflects the market now and the referral terms are ours to set,
// not the client's. The wallet shows the simulated result before the user approves anything.

import { isSolanaAddress } from "@/lib/helius";
import { quoteDetailed, swapTransaction } from "@/lib/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_RAW = 2n ** 64n - 1n;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const inputMint = String(body.inputMint ?? "");
  const outputMint = String(body.outputMint ?? "");
  const userPublicKey = String(body.userPublicKey ?? "");
  const amountRaw = String(body.amount ?? "");
  const slippageBps = Number(body.slippageBps ?? 50);

  if (![inputMint, outputMint, userPublicKey].every(isSolanaAddress)) {
    return Response.json({ error: "inputMint, outputMint and userPublicKey must be Solana addresses." }, { status: 400 });
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
    const leg = await quoteDetailed(inputMint, outputMint, amountRaw, { slippageBps, withFee: true, fresh: true });
    if (!leg.ok) {
      return Response.json({ status: leg.reason, error: leg.reason === "no-route" ? "No route at this size." : "Jupiter is unavailable right now." }, { status: 409 });
    }
    const tx = await swapTransaction({ quote: leg.quote, userPublicKey });
    if (!tx) return Response.json({ status: "unavailable", error: "Could not build the transaction. Try again." }, { status: 502 });

    return Response.json({
      status: "ok",
      swapTransaction: tx,
      inAmount: leg.quote.inAmount,
      outAmount: leg.quote.outAmount,
      priceImpactPct: leg.quote.priceImpactPct,
      routeLabels: leg.quote.routeLabels,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("swap failed", e);
    return Response.json({ status: "unavailable", error: "Could not build the transaction. Try again." }, { status: 502 });
  }
}
