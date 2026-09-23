// GET /api/history?mints=<m1,m2,…>&days=30 — daily rating history behind the charts.
// Public market data, same as /api/signals. Returns a list, not a map, so it serialises cleanly.

import { getVariantHistory } from "@/lib/history";
import { isSolanaAddress } from "@/lib/helius";
import { MAX_SIGNAL_DAYS } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MINTS = 100;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mints = (params.get("mints") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (mints.length === 0) {
    return Response.json({ error: "Pass at least one mint." }, { status: 400 });
  }
  if (mints.length > MAX_MINTS) {
    return Response.json({ error: `At most ${MAX_MINTS} mints per request.` }, { status: 400 });
  }
  const invalid = mints.filter((m) => !isSolanaAddress(m));
  if (invalid.length) {
    return Response.json({ error: `Invalid mint address: ${invalid[0]}` }, { status: 400 });
  }
  const days = Number(params.get("days") ?? 30);
  if (!Number.isFinite(days) || days < 1 || days > MAX_SIGNAL_DAYS) {
    return Response.json({ error: `days must be between 1 and ${MAX_SIGNAL_DAYS}.` }, { status: 400 });
  }

  try {
    const history = await getVariantHistory(mints, days);
    return Response.json(
      { windowDays: days, history: [...history.values()] },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (e) {
    console.error("history failed", e);
    return Response.json({ error: "History is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
