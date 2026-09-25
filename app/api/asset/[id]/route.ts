// GET /api/asset/<assetId> — ranked variants for one asset plus the safety report.

import { buildAssetDetail } from "@/lib/asset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_ID = /^[A-Za-z0-9._:@+-]{1,120}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = decodeURIComponent(id ?? "").trim();
  if (!VALID_ID.test(assetId)) {
    return Response.json({ error: "Invalid asset id." }, { status: 400 });
  }
  try {
    // ?ladder=1 waits for the measured exit ladder too; the screen fetches /api/exit separately.
    const withExitLadder = new URL(request.url).searchParams.get("ladder") === "1";
    const detail = await buildAssetDetail(assetId, { withExitLadder });
    if (!detail) return Response.json({ error: `No asset "${assetId}".` }, { status: 404 });
    return Response.json(detail, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("asset detail failed", e);
    return Response.json({ error: "Asset data is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
