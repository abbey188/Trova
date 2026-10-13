// GET /api/status → the state of the record: exit-measurement coverage per day and market session,
// and the method each daily snapshot was written under. See lib/status.ts.

import { buildStatus } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await buildStatus(), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } });
  } catch (e) {
    console.error("status failed", e);
    return Response.json({ error: "Status is temporarily unavailable." }, { status: 502 });
  }
}
