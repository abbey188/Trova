// GET /api/collateral/<mint> → one token's collateral file: its ladders by market session, who filled
// them, what a liquidator could sell inside each bonus, the real share's largest move across a
// closure, and the capacity history since measurements began. Unknown mint → 404.

import { buildCollateralFile } from "@/lib/collateral";
import { isSolanaAddress } from "@/lib/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!isSolanaAddress(mint)) return Response.json({ error: "mint must be a Solana address." }, { status: 400 });
  try {
    const file = await buildCollateralFile(mint);
    if (!file) return Response.json({ error: "Trova does not track this token." }, { status: 404 });
    return Response.json(file, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } });
  } catch (e) {
    console.error("collateral file failed", e);
    return Response.json({ error: "The collateral file is temporarily unavailable." }, { status: 502 });
  }
}
