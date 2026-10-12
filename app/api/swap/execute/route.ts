// POST /api/swap/execute { signedTransaction, requestId } → { status, signature }
//
// The second half of a trade on Jupiter's order route (see /api/swap). The wallet has already signed
// the transaction; a market-maker fill also needs the maker's signature, which only Jupiter can add,
// so the signed transaction is relayed to Jupiter's execute endpoint rather than sent by the wallet.
//
// Trova holds no key at any point: this route forwards bytes the user's wallet signed, and cannot
// change them without invalidating that signature.

import { executeOrder } from "@/lib/jupiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const REQUEST_ID = /^[0-9a-f-]{20,64}$/i;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const signedTransaction = String(body.signedTransaction ?? "");
  const requestId = String(body.requestId ?? "");
  // A Solana transaction is at most 1,232 bytes, so its base64 is under 1,700 characters.
  if (!BASE64.test(signedTransaction) || signedTransaction.length > 2_000) {
    return Response.json({ error: "signedTransaction must be a base64 transaction." }, { status: 400 });
  }
  if (!REQUEST_ID.test(requestId)) {
    return Response.json({ error: "requestId is not valid." }, { status: 400 });
  }

  const result = await executeOrder(signedTransaction, requestId);
  if (!result.ok) return Response.json({ status: "failed", error: result.error }, { status: 502, headers: { "Cache-Control": "no-store" } });
  return Response.json({ status: "ok", signature: result.signature }, { headers: { "Cache-Control": "no-store" } });
}
