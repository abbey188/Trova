// GET /api/collateral            → the collateral sheet as JSON: one row per tracked token.
// GET /api/collateral?format=csv → the same sheet as a CSV download.
//
// For a lender's risk team: what the holder can redeem, what the issuer can do on-chain, and how
// much leaves for under 1% and 5% — measured in US market hours and outside them. Public and free;
// every figure is reported, read from the mint, or measured. See lib/collateral.ts.

import { buildCollateralSheet, sheetCsv } from "@/lib/collateral";
import { overLimit, tooMany } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE = "public, s-maxage=600, stale-while-revalidate=3600";

export async function GET(request: Request) {
  if (overLimit(request, "collateral", 30)) return tooMany();
  try {
    const sheet = await buildCollateralSheet();
    if (new URL(request.url).searchParams.get("format") === "csv") {
      return new Response(sheetCsv(sheet), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="trova-collateral-${sheet.asOf.slice(0, 10)}.csv"`,
          "Cache-Control": CACHE,
        },
      });
    }
    return Response.json(sheet, { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    console.error("collateral sheet failed", e);
    return Response.json({ error: "The collateral sheet is temporarily unavailable." }, { status: 502 });
  }
}
