// GET /api/markets?lists=stocks,etfs,metals — the discovery screen.
// Every row carries the Trova grade from the latest daily snapshot, so discovery is rated, not
// just priced. Sections degrade individually; a failing list never empties the page.

import { getMarketsOverview } from "@/lib/markets";
import type { CuratedList } from "@/lib/tokens-xyz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED: CuratedList[] = ["stocks", "etfs", "metals", "rwas"];

export async function GET(request: Request) {
  const raw = (new URL(request.url).searchParams.get("lists") ?? "").split(",").map((l) => l.trim()).filter(Boolean);
  const invalid = raw.filter((l) => !ALLOWED.includes(l as CuratedList));
  if (invalid.length) {
    return Response.json({ error: `Unknown list: ${invalid[0]}. Use ${ALLOWED.join(", ")}.` }, { status: 400 });
  }
  const lists = (raw.length ? raw : ["stocks", "etfs", "metals"]) as CuratedList[];

  try {
    const overview = await getMarketsOverview(lists);
    return Response.json(overview, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("markets failed", e);
    return Response.json({ error: "Markets are temporarily unavailable. Please try again." }, { status: 502 });
  }
}
