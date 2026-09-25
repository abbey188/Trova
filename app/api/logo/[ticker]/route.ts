// GET /api/logo/<TICKER> — a company logo for the ~70% of companies tokens.xyz has no clean mark for.
//
// Proxied from Financial Modeling Prep's public logo images (no key) and cached at our edge for a
// week, so the page never depends on their host being up at demo time. Their marks are mostly white
// on transparent, drawn for dark backgrounds — the UI sets them on a dark disc. No logo → 404, and the
// UI falls back to the canvas's brand disc. Display only.

export const runtime = "nodejs";

const TICKER = /^[A-Z0-9.]{1,10}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const ticker = decodeURIComponent((await params).ticker ?? "").toUpperCase();
  if (!TICKER.test(ticker)) return new Response(null, { status: 400 });
  try {
    const res = await fetch(`https://financialmodelingprep.com/image-stock/${ticker}.png`, {
      next: { revalidate: 604_800 },
      signal: AbortSignal.timeout(8_000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
    }
    const body = await res.arrayBuffer();
    if (body.byteLength < 200) return new Response(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
    return new Response(body, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000" },
    });
  } catch {
    // Their host is down: no logo this time, and don't cache the miss for long.
    return new Response(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  }
}
