// GET /api/spark?t=NVDA,TSLA,… → { series: { [ticker]: number[] | null } }
//
// The 90-day line on a markets row. It is the REAL stock's daily closes (Backpack, source=External),
// not a token's candles: a curated row names a company, most of whose tokens trade thinly, and the
// markets list must not fan out to hundreds of tokens.xyz calls. Display only — never scored.
// A ticker Backpack doesn't list (private companies, commodities) comes back null and draws nothing.

import { getExternalKlines } from "@/lib/backpack";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX = 40;
const DAYS = 90;
const TICKER = /^[A-Z0-9.]{1,12}$/;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("t") ?? "";
  const tickers = [...new Set(raw.split(",").map((t) => t.trim().toUpperCase()).filter((t) => TICKER.test(t)))].slice(0, MAX);
  if (tickers.length === 0) return Response.json({ error: "Give ?t= one or more tickers." }, { status: 400 });

  const start = Math.floor(Date.now() / 1000) - DAYS * 86_400;
  const entries = await Promise.all(
    tickers.map(async (t) => {
      try {
        const k = await getExternalKlines(t, "1d", start);
        const closes = k.map((c) => Number(c.close)).filter((n) => Number.isFinite(n) && n > 0);
        return [t, closes.length > 1 ? closes : null] as const;
      } catch {
        return [t, null] as const;
      }
    }),
  );
  return Response.json(
    { series: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
