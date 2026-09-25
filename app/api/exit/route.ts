// GET /api/exit?mint=<mint>&sizes=5000,50000,250000 — what it costs to get in and back out of a
// token at each size, quoted both ways through Jupiter right now. Measured, not modelled.
//
// Separate from /api/asset because it is the one slow part of that page: two quotes per rung under a
// 10-per-10s limit. The screen renders the rating first and fills this in when it lands. Results are
// cached for five minutes inside lib/jupiter, so a second visitor pays nothing.

import { isSolanaAddress } from "@/lib/helius";
import { exitLadder } from "@/lib/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_SIZES = [5_000, 50_000, 250_000];
const MAX_SIZES = 4;
const MAX_USD = 10_000_000;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const mint = p.get("mint") ?? "";
  if (!isSolanaAddress(mint)) return Response.json({ error: "mint must be a Solana address." }, { status: 400 });

  const raw = p.get("sizes");
  const sizes = raw ? raw.split(",").map((x) => Number(x.trim())) : DEFAULT_SIZES;
  if (sizes.length === 0 || sizes.length > MAX_SIZES || sizes.some((n) => !Number.isFinite(n) || n < 1 || n > MAX_USD)) {
    return Response.json({ error: `sizes must be 1 to ${MAX_SIZES} dollar amounts between 1 and ${MAX_USD}.` }, { status: 400 });
  }

  try {
    const ladder = await exitLadder(mint, sizes);
    return Response.json({
      mint,
      quotedAt: Date.now(),
      ladder: ladder.map((l) => ({
        usdSize: l.usdSize,
        // "no-route" is a finding about the token; "unavailable" is about Jupiter. Never conflate them.
        status: l.status,
        roundTripPct: l.roundTripPct,
        routable: l.routable,
        blockedOn: l.blockedOn ?? null,
        routeLabels: l.routeLabels,
      })),
    }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("exit ladder failed", e);
    return Response.json({ error: "Exit cost is temporarily unavailable." }, { status: 502 });
  }
}
