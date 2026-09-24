// Helius (Solana mainnet RPC) — server-side reads by wallet PUBKEY only; never a signature.
// Uses getTokenAccountsByOwner (jsonParsed) for both token programs: getParsedTokenAccountsByOwner
// returns "Method not found" on Helius (tested 2026-09-15). xStocks are Token-2022.

import { isAddress } from "@solana/kit";

export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

function rpcUrl(): string {
  const url = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
  if (!url) throw new Error("Helius RPC URL not configured (HELIUS_RPC_URL / NEXT_PUBLIC_HELIUS_RPC_URL).");
  return url;
}

/** Raw Helius JSON-RPC call with retry on 429/5xx. Exported for token-extensions.ts. */
export async function heliusRpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
      if (body.error) throw new Error(`helius ${method}: ${body.error.message}`);
      return body.result as T;
    }
    if ((res.status !== 429 && res.status < 500) || attempt >= 3) throw new Error(`helius ${method} ${res.status}`);
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 120));
  }
}

/** True for a valid base58 Solana address (wallet or mint). */
export function isSolanaAddress(value: string): boolean {
  return isAddress(value);
}

export interface WalletToken {
  mint: string;
  amount: number;               // UI amount, summed across the owner's token accounts for this mint
  /** Exact balance in base units, summed as integers. This is what a sell quote needs — the UI
   *  amount is a float, and a scaled-UI multiplier is applied to `amount` later, never to this. */
  rawAmount: string;
  decimals: number;
  program: "spl-token" | "token-2022";
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString: string } };
      };
    };
  };
}

/** SOL balance plus every non-zero token balance the wallet holds (SPL Token and Token-2022). */
export async function getWalletTokens(owner: string): Promise<{ solBalance: number; tokens: WalletToken[] }> {
  const [balance, spl, token2022] = await Promise.all([
    heliusRpc<{ value: number }>("getBalance", [owner]),
    heliusRpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [owner, { programId: SPL_TOKEN_PROGRAM }, { encoding: "jsonParsed" }]),
    heliusRpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: "jsonParsed" }]),
  ]);

  const byMint = new Map<string, WalletToken>();
  for (const [program, accounts] of [["spl-token", spl.value], ["token-2022", token2022.value]] as const) {
    for (const { account } of accounts) {
      const { mint, tokenAmount } = account.data.parsed.info;
      const amount = Number(tokenAmount.uiAmountString);
      if (!(amount > 0)) continue;
      const prev = byMint.get(mint);
      const raw = (BigInt(prev?.rawAmount ?? "0") + BigInt(tokenAmount.amount)).toString();
      byMint.set(mint, { mint, amount: (prev?.amount ?? 0) + amount, rawAmount: raw, decimals: tokenAmount.decimals, program });
    }
  }
  return { solBalance: balance.value / 1e9, tokens: [...byMint.values()] };
}

/**
 * Decimals for each mint, read from the mint account itself — the only source that cannot disagree
 * with the chain. Needed to turn a raw quote amount into a number a person can read. Mints the RPC
 * cannot parse are absent; callers must treat that as "unknown", never as zero decimals.
 */
export async function getMintDecimals(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(mints)].filter(Boolean);
  if (unique.length === 0) return out;
  const res = await heliusRpc<{ value: ({ data?: { parsed?: { info?: { decimals?: number } } } } | null)[] }>(
    "getMultipleAccounts", [unique, { encoding: "jsonParsed" }]);
  (res.value ?? []).forEach((a, i) => {
    const d = a?.data?.parsed?.info?.decimals;
    if (typeof d === "number") out.set(unique[i], d);
  });
  return out;
}
