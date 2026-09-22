// Token-2022 "scaled UI amount" — how tokenized-stock issuers apply splits and distributions.
//
// Instead of sending you more tokens, the issuer changes a multiplier on the MINT and every holder's
// displayed balance rescales at once. Two consequences we care about:
//
//  1. It is a corporate action we can read BEFORE it happens. `newMultiplier` with a future
//     `newMultiplierEffectiveTimestamp` is a scheduled change that no announcement is needed for.
//     Verified live 2026-09-22: NFLXx/NFLXon carry Netflix's 10-for-1 split, METAx moved
//     1.002298 → 1.002852 on 18 Sep (a ~0.055% distribution), SPACEX has a 5x scheduled.
//
//  2. The RPC does NOT apply it. `getTokenAccountsByOwner` (jsonParsed) returns the RAW amount —
//     confirmed against NFLXx, whose on-chain supply/10^decimals is exactly a tenth of the supply
//     tokens.xyz reports. Since tokens.xyz prices per SCALED unit (NFLXx $71.21 against a real
//     Netflix price of $72.24), a holder's value is scaled amount × price. Skip this and a NFLXx
//     position reads as a tenth of its worth.

import { heliusRpc, TOKEN_2022_PROGRAM } from "./helius";

export interface ScaledUiAmount {
  /** The multiplier in force right now. */
  multiplier: number;
  /** The multiplier that takes over at `effectiveAt` (equal to `multiplier` when nothing is queued). */
  newMultiplier: number;
  /** Unix ms the new multiplier takes effect, or null when none is scheduled. */
  effectiveAt: number | null;
  /** True when a different multiplier is queued for a future date. */
  pending: boolean;
}

interface MintAccount {
  owner?: string;
  data?: {
    parsed?: {
      info?: {
        extensions?: { extension: string; state?: Record<string, unknown> }[];
      };
    };
  };
}

const BATCH = 90; // getMultipleAccounts caps at 100 addresses

function parse(account: MintAccount | null, now: number): ScaledUiAmount | null {
  if (account?.owner !== TOKEN_2022_PROGRAM) return null;
  const state = account.data?.parsed?.info?.extensions?.find((e) => e.extension === "scaledUiAmountConfig")?.state;
  if (!state) return null;

  const multiplier = Number(state.multiplier ?? 1);
  const newMultiplier = Number(state.newMultiplier ?? multiplier);
  const tsSec = Number(state.newMultiplierEffectiveTimestamp ?? 0);
  const effectiveAt = tsSec > 0 ? tsSec * 1000 : null;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;

  // Once the timestamp has passed the new multiplier IS the one in force.
  const live = effectiveAt != null && effectiveAt <= now ? newMultiplier : multiplier;
  return {
    multiplier: Number.isFinite(live) && live > 0 ? live : multiplier,
    newMultiplier: Number.isFinite(newMultiplier) && newMultiplier > 0 ? newMultiplier : multiplier,
    effectiveAt,
    pending: effectiveAt != null && effectiveAt > now && newMultiplier !== multiplier,
  };
}

/**
 * Scaled-UI-amount config for each mint that has one. Mints without the extension (all SPL Token,
 * and most Token-2022) are simply absent from the map — callers treat that as a multiplier of 1.
 * Never throws: a failed batch costs those mints their multiplier, not the whole request.
 */
export async function getScaledUiAmounts(mints: string[]): Promise<Map<string, ScaledUiAmount>> {
  const out = new Map<string, ScaledUiAmount>();
  const unique = [...new Set(mints)];
  const now = Date.now();

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    let accounts: (MintAccount | null)[];
    try {
      const res = await heliusRpc<{ value: (MintAccount | null)[] }>("getMultipleAccounts", [batch, { encoding: "jsonParsed" }]);
      accounts = res.value ?? [];
    } catch {
      continue;
    }
    accounts.forEach((account, j) => {
      const scaled = parse(account, now);
      if (scaled) out.set(batch[j], scaled);
    });
  }
  return out;
}

/** Raw on-chain balance → the balance a wallet displays, and the one tokenized-stock prices apply to. */
export function applyMultiplier(rawAmount: number, scaled: ScaledUiAmount | undefined): number {
  return scaled ? rawAmount * scaled.multiplier : rawAmount;
}

/**
 * Wallet balances with any scaled-UI multiplier applied, so amounts line up with the prices
 * tokens.xyz quotes. Falls back to the raw amounts if the lookup fails — a wrong-by-a-multiplier
 * balance is worse than a missing one, so failures are silent but never invented.
 */
export async function withScaledAmounts<T extends { mint: string; amount: number; program: string }>(tokens: T[]): Promise<T[]> {
  const token2022 = tokens.filter((t) => t.program === "token-2022").map((t) => t.mint);
  if (token2022.length === 0) return tokens;
  const scaled = await getScaledUiAmounts(token2022);
  if (scaled.size === 0) return tokens;
  return tokens.map((t) => {
    const s = scaled.get(t.mint);
    return s && s.multiplier !== 1 ? { ...t, amount: applyMultiplier(t.amount, s) } : t;
  });
}
