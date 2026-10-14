// POST /api/swap { inputMint, outputMint, amount, slippageBps, userPublicKey }
//   → { swapTransaction, route } — an UNSIGNED transaction, base64.
//
// Two routes, and the trade is built on whichever returns clearly more. "pools" is Jupiter's
// aggregator: the wallet signs AND sends. "order" is the route market makers quote on — the only
// way to fill tokens like Ondo's at a fair price: the wallet signs WITHOUT sending, and
// POST /api/swap/execute relays it to Jupiter, which adds the maker's signature. Before 2026-10-12
// every trade went through pools, so selling a market-maker-filled token here would have returned a
// fraction of its value.
//
// The only step in Trova that leads to a signature, and the signature happens in the user's wallet,
// never here: Trova holds no keys. The server re-quotes fresh rather than trusting a quote sent from
// the browser, so the transaction reflects the market now and the referral terms are ours to set,
// not the client's. The wallet shows the simulated result before the user approves anything.

import { isSolanaAddress } from "@/lib/helius";
import { ORDER_ROUTE_ENABLED, orderQuote, preferOrder, quoteDetailed, swapTransaction } from "@/lib/jupiter";

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
    const [leg, order] = await Promise.all([
      quoteDetailed(inputMint, outputMint, amountRaw, { slippageBps, withFee: true, fresh: true }),
      orderQuote(inputMint, outputMint, amountRaw, { taker: userPublicKey }),
    ]);

    // Never fall back to pools because the market-maker route could not be reached: for a token
    // market makers fill, the pool price can be a fraction of the real one.
    if (ORDER_ROUTE_ENABLED && !order.ok && order.reason === "unavailable") {
      return Response.json({ status: "unavailable", error: "Jupiter is unavailable right now. Try again in a moment." }, { status: 409 });
    }

    // Asked with the wallet attached, the market-maker route can refuse what it quoted without one:
    // measured 2026-10-14 after the US close, TSLAon quoted at 0.36% with no wallet and, with one,
    // "Trading is not available outside of market hours". Building the trade on pools then would have
    // filled from empty pools — about 12% lost on $500 — under a quote that promised 0.36%. So a
    // refusal from the market makers is passed on, never quietly replaced by pools.
    if (ORDER_ROUTE_ENABLED && !order.ok && order.reason === "market-closed") {
      return Response.json({ status: "market-closed", error: "This token does not trade while the US market is shut. Try again when it opens." }, { status: 409 });
    }
    if (ORDER_ROUTE_ENABLED && !order.ok && leg.ok) {
      const indicative = await orderQuote(inputMint, outputMint, amountRaw);
      if (indicative.ok && preferOrder(leg.quote, indicative.quote)) {
        return Response.json({ status: "no-route", error: "Market makers quoted this but will not fill it for your wallet right now, and through pools it would return far less. Trova will not build that trade." }, { status: 409 });
      }
    }

    if (preferOrder(leg.ok ? leg.quote : null, order.ok ? order.quote : null) && order.ok && order.quote.transaction && order.quote.requestId) {
      return Response.json({
        status: "ok",
        route: "order",
        swapTransaction: order.quote.transaction,
        requestId: order.quote.requestId,
        inAmount: order.quote.inAmount,
        outAmount: order.quote.outAmount,
        priceImpactPct: 0,
        routeLabels: order.quote.routeLabels,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!leg.ok) {
      const reason = !order.ok && order.reason === "market-closed" ? "market-closed" : leg.reason;
      const error = reason === "market-closed" ? "This token does not trade while the US market is shut."
        : reason === "no-route" ? "No route at this size." : "Jupiter is unavailable right now.";
      return Response.json({ status: reason, error }, { status: 409 });
    }
    const tx = await swapTransaction({ quote: leg.quote, userPublicKey });
    if (!tx) return Response.json({ status: "unavailable", error: "Could not build the transaction. Try again." }, { status: 502 });

    return Response.json({
      status: "ok",
      route: "pools",
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
