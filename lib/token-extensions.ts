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
import type { IssuerControls } from "./types";

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
        mintAuthority?: string | null;
        freezeAuthority?: string | null;
        extensions?: { extension: string; state?: Record<string, unknown> }[];
      };
    };
  };
}

interface TransferFee { epoch?: number; transferFeeBasisPoints?: number }

/**
 * The issuer's on-chain powers over one mint. Read literally, because the difference matters:
 * verified on mainnet 2026-10-11, every xStocks, Ondo, Backpack and PreStocks mint carries a
 * default-account-state setting whose VALUE is "initialized" (accounts are not frozen by default),
 * and a transfer-hook slot with NO program attached. Reporting the presence of the extension as
 * "default-frozen" or "has a transfer hook" would be wrong. Also verified: xStocks, Backpack and
 * PreStocks mints have a permanent delegate, Ondo mints do not; PreStocks charges 1% per transfer.
 */
function parseControls(account: MintAccount | null, epoch: number | null): IssuerControls | null {
  const info = account?.data?.parsed?.info;
  if (!account || !info) return null;
  const ext = new Map((info.extensions ?? []).map((e) => [e.extension, e.state ?? {}]));

  const fee = ext.get("transferFeeConfig") as { olderTransferFee?: TransferFee; newerTransferFee?: TransferFee } | undefined;
  // The newer fee applies from its epoch on; before that the older one is still in force.
  const inForce = fee ? (epoch != null && fee.newerTransferFee?.epoch != null && epoch < fee.newerTransferFee.epoch ? fee.olderTransferFee : fee.newerTransferFee) : undefined;
  const hook = ext.get("transferHook") as { programId?: string | null } | undefined;
  const state = ext.get("defaultAccountState") as { accountState?: string } | undefined;
  const pause = ext.get("pausableConfig") as { paused?: boolean } | undefined;

  return {
    token2022: account.owner === TOKEN_2022_PROGRAM,
    canMint: Boolean(info.mintAuthority),
    canFreeze: Boolean(info.freezeAuthority),
    canSeize: Boolean((ext.get("permanentDelegate") as { delegate?: string | null } | undefined)?.delegate),
    canPause: pause != null,
    paused: pause?.paused === true,
    newAccountsFrozen: state ? state.accountState === "frozen" : null,
    hookSlot: hook != null,
    hookProgram: hook?.programId ?? null,
    transferFeeBps: fee ? Number(inForce?.transferFeeBasisPoints ?? 0) : null,
  };
}

let epochCache: { at: number; epoch: number } | null = null;
async function currentEpoch(): Promise<number | null> {
  if (epochCache && Date.now() - epochCache.at < 10 * 60_000) return epochCache.epoch;
  try {
    const res = await heliusRpc<{ epoch: number }>("getEpochInfo", []);
    epochCache = { at: Date.now(), epoch: res.epoch };
    return res.epoch;
  } catch {
    return epochCache?.epoch ?? null;
  }
}

export interface MintFacts { scaled: ScaledUiAmount | null; controls: IssuerControls | null }

/**
 * Everything Trova reads off a mint account, in one pass: the scaled-UI multiplier and the issuer's
 * controls. Never throws — a failed batch leaves those mints out of the map.
 */
export async function getMintFacts(mints: string[]): Promise<Map<string, MintFacts>> {
  const out = new Map<string, MintFacts>();
  const unique = [...new Set(mints)];
  if (unique.length === 0) return out;
  const now = Date.now();
  const epoch = await currentEpoch();

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
      out.set(batch[j], { scaled: parse(account, now), controls: parseControls(account, epoch) });
    });
  }
  return out;
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
