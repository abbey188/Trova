// Daily snapshot, triggered by Vercel Cron (vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; anything else is rejected.

import { runSnapshot } from "@/lib/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby maximum; a run takes ~100s

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await runSnapshot());
  } catch (e) {
    console.error("snapshot failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "snapshot failed" }, { status: 500 });
  }
}
