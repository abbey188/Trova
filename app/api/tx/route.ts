// GET /api/tx?signature=<base58> — did a signed trade land?
//
// The wallet signs AND sends (Wallet Standard signAndSendTransaction), so Trova never touches a
// signed transaction or a key. This only asks the chain, through our server-side RPC, what happened
// to a signature the wallet handed back. The screen polls it until the answer is final.

import { heliusRpc } from "@/lib/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// A transaction signature is 64 bytes, 87–88 base58 characters.
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

interface SignatureStatus {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
}

export async function GET(request: Request) {
  const signature = new URL(request.url).searchParams.get("signature") ?? "";
  if (!SIGNATURE.test(signature)) {
    return Response.json({ error: "signature must be a base58 transaction signature." }, { status: 400 });
  }

  try {
    const res = await heliusRpc<{ value: (SignatureStatus | null)[] }>(
      "getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
    const s = res.value?.[0] ?? null;

    // Not seen yet is normal for the first second or two after sending — "pending", not "failed".
    const status =
      s == null ? "pending"
      : s.err != null ? "failed"
      : s.confirmationStatus === "finalized" ? "finalized"
      : s.confirmationStatus === "confirmed" ? "confirmed"
      : "pending";

    return Response.json(
      { signature, status, slot: s?.slot ?? null, error: s?.err ?? null, explorerUrl: `https://solscan.io/tx/${signature}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("tx status failed", e);
    // Could not ask — which says nothing about whether the trade landed.
    return Response.json({ signature, status: "unknown", error: "Could not check right now." }, { status: 502 });
  }
}
