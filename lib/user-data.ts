// Per-device profile and watchlist. Server-only.
//
// The browser keeps a random 32-byte secret and sends it as `x-trova-key`. We store only its SHA-256,
// so the database never holds anything that could be replayed to write to someone's watchlist, and
// no row is tied to a wallet — looking at a portfolio stays signature-free. See the migration header.
//
// Degrades, doesn't crash: if the tables have not been created yet, callers get a typed
// NotConfigured error and the app carries on with an empty watchlist.

import { createHash } from "node:crypto";

import { getAssetRows } from "./markets";
import { deleteRows, selectRows, upsertRows } from "./supabase-rest";
import type { MarketRow } from "./types";

export const KEY_HEADER = "x-trova-key";
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;      // 32 random bytes, base64url, unpadded
const ASSET_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/i;
export const MAX_WATCHLIST = 100;
const NICKNAME_MAX = 24;

export interface Profile {
  nickname: string | null;
  alertUntradable: boolean;
}

export class NotConfigured extends Error {
  constructor() {
    super("Watchlist storage is not set up yet.");
  }
}

/** The stored identity for a request, or null when the header is missing or malformed. */
export function keyHashFrom(request: Request): string | null {
  const key = request.headers.get(KEY_HEADER)?.trim() ?? "";
  if (!KEY_PATTERN.test(key)) return null;
  return createHash("sha256").update(key).digest("hex");
}

export function isAssetId(value: string): boolean {
  return ASSET_ID.test(value);
}

/** A nickname a person typed, made safe to store and show: trimmed, no control characters, at most 24. */
export function cleanNickname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = [...input]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX);
  return s.length ? s : null;
}

// PostgREST reports a missing table (migration not applied) as 42P01 / PGRST205.
function rethrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/42P01|does not exist|PGRST205|Could not find the table/i.test(msg)) throw new NotConfigured();
  throw e;
}

export async function getProfile(keyHash: string): Promise<Profile> {
  try {
    const rows = await selectRows<{ nickname: string | null; alert_untradable: boolean }>(
      "trova_profiles", `select=nickname,alert_untradable&key_hash=eq.${keyHash}&limit=1`);
    const r = rows[0];
    return { nickname: r?.nickname ?? null, alertUntradable: r?.alert_untradable ?? true };
  } catch (e) {
    rethrow(e);
  }
}

export async function updateProfile(keyHash: string, patch: { nickname?: string | null; alertUntradable?: boolean }): Promise<Profile> {
  const row: Record<string, unknown> = { key_hash: keyHash, updated_at: new Date().toISOString() };
  if (patch.nickname !== undefined) row.nickname = patch.nickname;
  if (patch.alertUntradable !== undefined) row.alert_untradable = patch.alertUntradable;
  try {
    await upsertRows("trova_profiles", [row], "key_hash");
  } catch (e) {
    rethrow(e);
  }
  return getProfile(keyHash);
}

export async function listWatchlistIds(keyHash: string): Promise<string[]> {
  try {
    const rows = await selectRows<{ asset_id: string }>(
      "watchlist_items", `select=asset_id&key_hash=eq.${keyHash}&order=added_at.desc`);
    return rows.map((r) => r.asset_id);
  } catch (e) {
    rethrow(e);
  }
}

/** The watchlist as ready-to-render rows: name, logo, price, grade, and the mints for its feed. */
export async function getWatchlist(keyHash: string): Promise<MarketRow[]> {
  const ids = await listWatchlistIds(keyHash);
  return ids.length ? getAssetRows(ids) : [];
}

export async function addToWatchlist(keyHash: string, assetId: string): Promise<{ added: boolean; full: boolean }> {
  const ids = await listWatchlistIds(keyHash);
  if (ids.includes(assetId)) return { added: false, full: false };
  if (ids.length >= MAX_WATCHLIST) return { added: false, full: true };
  try {
    // The profile row must exist first (foreign key). Upserting only the key leaves any nickname as is.
    await upsertRows("trova_profiles", [{ key_hash: keyHash }], "key_hash");
    await upsertRows("watchlist_items", [{ key_hash: keyHash, asset_id: assetId }], "key_hash,asset_id");
  } catch (e) {
    rethrow(e);
  }
  return { added: true, full: false };
}

export async function removeFromWatchlist(keyHash: string, assetId: string): Promise<void> {
  try {
    await deleteRows("watchlist_items", `key_hash=eq.${keyHash}&asset_id=eq.${encodeURIComponent(assetId)}`);
  } catch (e) {
    rethrow(e);
  }
}
