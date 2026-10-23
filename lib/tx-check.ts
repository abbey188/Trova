// A last check on a swap transaction before it is handed to the user's wallet. Server-only.
//
// Trova never holds a key, so the worst it can do to a user is ask them to sign the wrong thing. That
// could happen if Jupiter's API returned something unexpected, or if this server were compromised —
// in which case this check is one more thing an attacker must defeat, not a guarantee. The wallet's own
// simulation is the user's last line; this is the line before it.
//
// What a legitimate trade looks like (decoded from live transactions on 2026-10-23):
//   pools route  — the user pays the fee and is the only signer; top-level programs are Compute Budget,
//                  Associated Token Account, the token programs and Jupiter's aggregator.
//   order route  — the user signs; a market maker or Jupiter's fee payer may sign too; top-level
//                  programs include JupiterZ (the market-maker settlement program).
// Anything else is refused, with the reason logged. A refused trade costs a user a retry; a signed
// malicious one could cost them their tokens.

import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";

const COMMON = [
  "ComputeBudget111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // associated token accounts
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",  // SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",  // Token-2022 (xStocks, Ondo)
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",  // Jupiter aggregator v6
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",  // memo
];
const ORDER_ONLY = [
  "61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH", // JupiterZ market-maker settlement
  "11111111111111111111111111111111",             // system program (fee and rent handling on gasless fills)
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",  // Lighthouse assertions Jupiter adds to protect a fill
];

interface Message {
  staticAccounts: string[];
  header: { numSignerAccounts: number };
  instructions: { programAddressIndex: number }[];
}

export type TxVerdict = { ok: true } | { ok: false; reason: string };

/** Check a base64 transaction from Jupiter against what a trade for `user` on `route` should be. */
export function checkSwapTransaction(base64: string, user: string, route: "pools" | "order"): TxVerdict {
  let msg: Message;
  try {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(base64));
    msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes) as unknown as Message;
  } catch {
    return { ok: false, reason: "transaction could not be decoded" };
  }
  const signers = msg.staticAccounts.slice(0, msg.header.numSignerAccounts);
  if (!signers.includes(user)) return { ok: false, reason: "the user is not a signer" };
  if (route === "pools" && (msg.staticAccounts[0] !== user || signers.length !== 1)) {
    return { ok: false, reason: "a pools trade must be paid for and signed by the user alone" };
  }
  if (route === "order" && signers.length > 3) return { ok: false, reason: "too many signers for a market-maker fill" };

  const allowed = new Set(route === "order" ? [...COMMON, ...ORDER_ONLY] : COMMON);
  const programs = [...new Set(msg.instructions.map((i) => msg.staticAccounts[i.programAddressIndex]))];
  const unknown = programs.filter((p) => !allowed.has(p));
  if (unknown.length) return { ok: false, reason: `unexpected program ${unknown.join(", ")}` };
  if (!programs.some((p) => p === "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" || p === "61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH")) {
    return { ok: false, reason: "no Jupiter swap instruction" };
  }
  return { ok: true };
}
