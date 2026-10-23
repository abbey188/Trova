// GET /api/quote?inputMint=&outputMint=&amount=<raw base units>&slippageBps=50
//
// What the buy and swap sheets show before anything is signed: what you pay, what you get, the
// route, and — the part no other front end shows — what it would cost to leave again at this size,
// measured by quoting the sale straight back. Read-only; nothing here asks for a signature.

import { overLimit, tooMany } from "@/lib/guard";
import { getMintDecimals, isSolanaAddress } from "@/lib/helius";
import { bestQuote, ORDER_ROUTE_ENABLED, orderQuote, preferOrder, quoteDetailed } from "@/lib/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_RAW = 2n ** 64n - 1n;

export async function GET(request: Request) {
  if (overLimit(request, "quote", 60)) return tooMany();
  const p = new URL(request.url).searchParams;
  const inputMint = p.get("inputMint") ?? "";
  const outputMint = p.get("outputMint") ?? "";
  const amountRaw = p.get("amount") ?? "";
  const slippageBps = Number(p.get("slippageBps") ?? 50);
  // Optional: the connected wallet's public address. With it, the market-maker route answers for
  // THIS wallet — which can differ from its open quote (Ondo tokens refuse wallets outside US market
  // hours) — so the sheet shows what will actually execute. Never a signature (principle 1).
  const takerRaw = p.get("taker");
  const taker = takerRaw && isSolanaAddress(takerRaw) ? takerRaw : undefined;

  if (!isSolanaAddress(inputMint) || !isSolanaAddress(outputMint)) {
    return Response.json({ error: "inputMint and outputMint must be Solana addresses." }, { status: 400 });
  }
  if (inputMint === outputMint) {
    return Response.json({ error: "inputMint and outputMint must differ." }, { status: 400 });
  }
  if (!/^\d{1,20}$/.test(amountRaw) || BigInt(amountRaw) <= 0n || BigInt(amountRaw) > MAX_RAW) {
    return Response.json({ error: "amount must be a positive integer in base units." }, { status: 400 });
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 300) {
    return Response.json({ error: "slippageBps must be an integer from 1 to 300." }, { status: 400 });
  }

  try {
    // Both routes, because the trade executes on whichever returns clearly more (see /api/swap).
    const [leg, order, decimals] = await Promise.all([
      quoteDetailed(inputMint, outputMint, amountRaw, { slippageBps, withFee: true, fresh: true }),
      orderQuote(inputMint, outputMint, amountRaw, { fresh: true, taker }),
      getMintDecimals([inputMint, outputMint]).catch(() => new Map<string, number>()),
    ]);
    const ui = (raw: string, mint: string) => {
      const d = decimals.get(mint);
      return d == null ? null : Number(raw) / 10 ** d;
    };

    // The market-maker route could not be reached: a pool quote alone may be a fraction of the real
    // price, so there is no quote to show rather than a misleading one.
    if (ORDER_ROUTE_ENABLED && !order.ok && order.reason === "unavailable") {
      return Response.json({ status: "unavailable", inputMint, outputMint, amount: amountRaw });
    }
    // Asked for a wallet, the quote mirrors what /api/swap will do: if the market makers refuse this
    // wallet, there is no trade to show — not a pool fill the user never agreed to.
    if (taker && !order.ok && order.reason === "market-closed") {
      return Response.json({ status: "market-closed", inputMint, outputMint, amount: amountRaw });
    }
    if (taker && !order.ok && leg.ok) {
      const indicative = await orderQuote(inputMint, outputMint, amountRaw);
      if (indicative.ok && preferOrder(leg.quote, indicative.quote)) return Response.json({ status: "no-route", inputMint, outputMint, amount: amountRaw });
    }
    const viaOrder = preferOrder(leg.ok ? leg.quote : null, order.ok ? order.quote : null);
    if (!leg.ok && !viaOrder) {
      // "no-route" is a finding about the token; "unavailable" is about Jupiter; "market-closed" is
      // about the hour. Never conflate them.
      const status = !order.ok && order.reason === "market-closed" ? "market-closed" : leg.reason;
      return Response.json({ status, inputMint, outputMint, amount: amountRaw });
    }
    const q = viaOrder && order.ok
      ? { inAmount: order.quote.inAmount, outAmount: order.quote.outAmount, priceImpactPct: 0, routeLabels: order.quote.routeLabels, slippageBps }
      : leg.ok ? leg.quote : null;
    if (!q) return Response.json({ status: "unavailable", inputMint, outputMint, amount: amountRaw });

    // Cost to leave again: quote the sale straight back at the size just bought, on the better route.
    const back = await bestQuote(outputMint, inputMint, q.outAmount, { slippageBps });
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
      // "order" trades are filled by a market maker and signed without being sent (see /api/swap).
      route: viaOrder ? "order" : "pools",
      liquidity: viaOrder && order.ok ? order.quote.liquidity : "pools",
      leaveAgain,
      quotedAt: Date.now(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("quote failed", e);
    return Response.json({ status: "unavailable", error: "Quotes are temporarily unavailable." }, { status: 502 });
  }
}
