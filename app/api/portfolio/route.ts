// GET /api/portfolio?wallet=<address> — read-only portfolio by public key (never a signature).

import { isSolanaAddress } from "@/lib/helius";
import { buildPortfolio, DEMO_WALLET } from "@/lib/portfolio";
import { overLimit, tooMany } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (overLimit(request, "portfolio", 20)) return tooMany();
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim() ?? "";
  // ?wallet=demo is the demo portfolio shown before a wallet connects.
  if (wallet !== DEMO_WALLET && !isSolanaAddress(wallet)) {
    return Response.json({ error: "Provide a valid Solana wallet address as ?wallet=" }, { status: 400 });
  }
  try {
    const portfolio = await buildPortfolio(wallet);
    return Response.json(portfolio, { headers: { "Cache-Control": wallet === DEMO_WALLET ? "public, s-maxage=300, stale-while-revalidate=86400" : "private, no-store" } });
  } catch (e) {
    console.error("portfolio failed", e);
    return Response.json({ error: "Portfolio data is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
