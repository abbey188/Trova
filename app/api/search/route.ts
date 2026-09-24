// GET /api/search?q= — the search box. Fuzzy upstream ("nvid" finds NVIDIA), and every hit carries
// its Trova grade so a search result can be judged, not just found.

import { searchMarket } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_QUERY = 64;

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ query: "", results: [] });
  if (q.length > MAX_QUERY) {
    return Response.json({ error: `Query must be ${MAX_QUERY} characters or fewer.` }, { status: 400 });
  }

  try {
    const results = await searchMarket(q);
    return Response.json({ query: q, results }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("search failed", e);
    return Response.json({ error: "Search is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
