// GET /api/signals?mints=<m1,m2,…>&days=30 — "what changed" signals from daily snapshots.
// Omit mints for universe-wide changes.

import { isSolanaAddress } from "@/lib/helius";
import { getMonitoringStats } from "@/lib/history";
import { getChangeSignals, MAX_SIGNAL_DAYS } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MINTS = 100;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mints = (params.get("mints") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
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
    // Universe-wide requests also carry the monitoring counts the home screen shows, so the
    // dashboard number and the feed below it are computed from the same signals and cannot disagree.
    // The scan is handed to getMonitoringStats rather than run again — it reads every snapshot for
    // the whole universe, and once per request is enough.
    const result = await getChangeSignals({ mints: mints.length ? mints : undefined, days });
    const wantStats = mints.length === 0 && params.get("stats") !== "false";
    const stats = wantStats ? await getMonitoringStats(days, result) : null;
    return Response.json(
      stats ? { ...result, stats } : result,
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (e) {
    console.error("signals failed", e);
    return Response.json({ error: "Signals are temporarily unavailable. Please try again." }, { status: 502 });
  }
}
