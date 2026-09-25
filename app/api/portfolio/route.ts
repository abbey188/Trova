// GET /api/portfolio?wallet=<address> — read-only portfolio by public key (never a signature).

import { isSolanaAddress } from "@/lib/helius";
import { buildPortfolio, DEMO_WALLET } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim() ?? "";
  // ?wallet=demo is the demo portfolio shown before a wallet connects.
  if (wallet !== DEMO_WALLET && !isSolanaAddress(wallet)) {
    return Response.json({ error: "Provide a valid Solana wallet address as ?wallet=" }, { status: 400 });
  }
  try {
    const portfolio = await buildPortfolio(wallet);
    return Response.json(portfolio, { headers: { "Cache-Control": wallet === DEMO_WALLET ? "public, s-maxage=120, stale-while-revalidate=600" : "private, max-age=15" } });
  } catch (e) {
    console.error("portfolio failed", e);
    return Response.json({ error: "Portfolio data is temporarily unavailable. Please try again." }, { status: 502 });
  }
}
