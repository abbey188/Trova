// Exit measurement, triggered by Vercel Cron (vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; anything else is rejected.
//
// One call cannot measure every token: quotes are paced at about one a second and a function may
// run for 300 seconds. So each call measures as many tokens as fit, most tradable first, and skips
// the ones already measured today in this market session. Several calls a day cover the list.

import { runMeasurement } from "@/lib/exit-measure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby maximum

const BUDGET_MS = 270_000; // leave room to finish the token in hand and answer

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await runMeasurement({ budgetMs: BUDGET_MS }));
  } catch (e) {
    console.error("exit measurement failed", e);
    return Response.json({ error: e instanceof Error ? e.message : "exit measurement failed" }, { status: 500 });
  }
}
