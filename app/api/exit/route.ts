// GET /api/exit?mint=<mint>            — the token's exit ladder: the stored daily measurement when
//                                        there is a recent one, otherwise quoted now.
// GET /api/exit?mint=<mint>&sizes=...   — quoted now at those sizes (a size the reader typed in).
//
// Each rung is a round trip — buy with USDC, sell straight back — on the better of Jupiter's two
// routes, and says whether pools or a market maker filled it and what pools alone would have given.
// Measured, not modelled. The ceilings are the bracket the ladder actually found: the largest size
// that left under 1% (and 5%), and the smallest size above it that did not.
//
// Separate from /api/asset because quoting is the one slow part of that page: up to five quotes per
// rung under a ten-per-ten-seconds limit. The screen renders the rating first and fills this in.

import { latestMeasurements, usSession } from "@/lib/exit-store";
import { isSolanaAddress } from "@/lib/helius";
import { exitCeiling, exitLadder, shutForWallets } from "@/lib/jupiter";
import { overLimit, tooMany } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIVE_SIZES = [5_000, 50_000, 250_000];
const MAX_SIZES = 5;
const MAX_USD = 25_000_000;
const STORED_FRESH_MS = 36 * 3_600_000;

type Rung = { usdSize: number; status: string; roundTripPct: number | null; routable: boolean; blockedOn?: string | null; routeLabels: string[]; liquidity?: string | null; poolsRoundTripPct?: number | null };

function body(mint: string, ladder: Rung[], extra: Record<string, unknown>) {
  const forCeiling = ladder.map((l) => ({ status: l.status as "ok", roundTripPct: l.roundTripPct, usdSize: l.usdSize }));
  return {
    mint,
    ...extra,
    ladder,
    ceilings: { under1: exitCeiling(forCeiling, 1), under5: exitCeiling(forCeiling, 5) },
  };
}

export async function GET(request: Request) {
  if (overLimit(request, "exit", 30)) return tooMany();
  const p = new URL(request.url).searchParams;
  const mint = p.get("mint") ?? "";
  if (!isSolanaAddress(mint)) return Response.json({ error: "mint must be a Solana address." }, { status: 400 });

  const raw = p.get("sizes");
  const sizes = raw ? raw.split(",").map((x) => Number(x.trim())) : null;
  if (sizes && (sizes.length === 0 || sizes.length > MAX_SIZES || sizes.some((n) => !Number.isFinite(n) || n < 1 || n > MAX_USD))) {
    return Response.json({ error: `sizes must be 1 to ${MAX_SIZES} dollar amounts between 1 and ${MAX_USD}.` }, { status: 400 });
  }

  try {
    // No sizes asked for: the stored measurement answers at once, and is the same one the rating used.
    if (!sizes) {
      const stored = (await latestMeasurements([mint])).get(mint);
      const newest = [stored?.scored, stored?.closed].filter((m): m is NonNullable<typeof m> => !!m).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
      if (newest && Date.now() - Date.parse(newest.takenAt) < STORED_FRESH_MS) {
        return Response.json(body(mint, newest.rungs.map((r) => ({ ...r, blockedOn: null })), {
          source: "stored", quotedAt: Date.parse(newest.takenAt), session: newest.session,
          // What it does while the US market is shut, when that was measured too.
          closedSession: stored?.closed ? { takenAt: stored.closed.takenAt, ladder: stored.closed.rungs } : null,
        }), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
      }
    }

    // With the market shut, a wallet-free quote can promise what no wallet could execute (Ondo tokens).
    if (usSession() === "closed" && (await shutForWallets(mint))) {
      const shut = (sizes ?? LIVE_SIZES).map((usdSize) => ({ usdSize, status: "market-closed", roundTripPct: null, routable: false, blockedOn: null, routeLabels: [], liquidity: null, poolsRoundTripPct: null }));
      return Response.json(body(mint, shut, { source: "live", quotedAt: Date.now(), session: "closed", closedSession: null }), { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } });
    }
    const ladder = await exitLadder(mint, sizes ?? LIVE_SIZES);
    return Response.json(body(mint, ladder.map((l) => ({
      usdSize: l.usdSize,
      // "no-route" is a finding about the token; "unavailable" is about Jupiter; "market-closed" is
      // about the hour. Never conflate them.
      status: l.status,
      roundTripPct: l.roundTripPct,
      routable: l.routable,
      blockedOn: l.blockedOn ?? null,
      routeLabels: l.routeLabels,
      liquidity: l.liquidity,
      poolsRoundTripPct: l.poolsRoundTripPct,
    })), { source: "live", quotedAt: Date.now(), session: null, closedSession: null }),
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("exit ladder failed", e);
    return Response.json({ error: "Exit cost is temporarily unavailable." }, { status: 502 });
  }
}
