// GET    /api/watchlist             → { items: MarketRow[] }  (graded, with mints for /api/signals)
// POST   /api/watchlist { assetId } → { added, full }
// DELETE /api/watchlist?assetId=    → { removed: true }
// Identified by the device key in `x-trova-key`. Watching an asset needs no wallet and no signature.

import { getAsset } from "@/lib/tokens-xyz";
import {
  addToWatchlist, getWatchlist, isAssetId, keyHashFrom, MAX_WATCHLIST, NotConfigured, removeFromWatchlist,
} from "@/lib/user-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(e: unknown) {
  if (e instanceof NotConfigured) {
    return Response.json({ error: e.message, configured: false }, { status: 503, headers: NO_STORE });
  }
  console.error("watchlist failed", e);
  return Response.json({ error: "Watchlist is temporarily unavailable." }, { status: 502, headers: NO_STORE });
}

const unauthorized = () =>
  Response.json({ error: "Missing or malformed device key." }, { status: 401, headers: NO_STORE });

export async function GET(request: Request) {
  const keyHash = keyHashFrom(request);
  if (!keyHash) return unauthorized();
  try {
    return Response.json({ items: await getWatchlist(keyHash), max: MAX_WATCHLIST }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  const keyHash = keyHashFrom(request);
  if (!keyHash) return unauthorized();

  let assetId = "";
  try {
    assetId = String(((await request.json()) as { assetId?: unknown }).assetId ?? "");
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400, headers: NO_STORE });
  }
  if (!isAssetId(assetId)) return Response.json({ error: "Invalid assetId." }, { status: 400, headers: NO_STORE });

  // Only real assets can be watched — otherwise the table becomes free storage for anything.
  try {
    if (!(await getAsset(assetId))) return Response.json({ error: "Unknown asset." }, { status: 404, headers: NO_STORE });
  } catch {
    return Response.json({ error: "Could not check that asset right now." }, { status: 502, headers: NO_STORE });
  }

  try {
    const result = await addToWatchlist(keyHash, assetId);
    if (result.full) {
      return Response.json({ ...result, error: `A watchlist holds up to ${MAX_WATCHLIST} assets.` }, { status: 409, headers: NO_STORE });
    }
    return Response.json(result, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(request: Request) {
  const keyHash = keyHashFrom(request);
  if (!keyHash) return unauthorized();
  const assetId = new URL(request.url).searchParams.get("assetId") ?? "";
  if (!isAssetId(assetId)) return Response.json({ error: "Invalid assetId." }, { status: 400, headers: NO_STORE });
  try {
    await removeFromWatchlist(keyHash, assetId);
    return Response.json({ removed: true }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
