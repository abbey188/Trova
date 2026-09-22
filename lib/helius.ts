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

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
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
    rpc<{ value: number }>("getBalance", [owner]),
    rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [owner, { programId: SPL_TOKEN_PROGRAM }, { encoding: "jsonParsed" }]),
    rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: "jsonParsed" }]),
  ]);

  const byMint = new Map<string, WalletToken>();
  for (const [program, accounts] of [["spl-token", spl.value], ["token-2022", token2022.value]] as const) {
    for (const { account } of accounts) {
      const { mint, tokenAmount } = account.data.parsed.info;
      const amount = Number(tokenAmount.uiAmountString);
      if (!(amount > 0)) continue;
      const prev = byMint.get(mint);
      byMint.set(mint, { mint, amount: (prev?.amount ?? 0) + amount, decimals: tokenAmount.decimals, program });
    }
  }
  return { solBalance: balance.value / 1e9, tokens: [...byMint.values()] };
}
