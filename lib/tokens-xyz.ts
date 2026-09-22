// tokens.xyz Assets API client — server-side only (holds the key).
// Base + auth + endpoints validated against docs.tokens.xyz (2026-09-15).
// Real response shapes validated against live solana + tesla payloads.

import type { TxzVariant, TxzVariantsResponse } from "./types";

const BASE = "https://api.tokens.xyz/v1";

function key(): string {
  const k = process.env.TOKENS_XYZ_API_KEY;
  if (!k) throw new Error("TOKENS_XYZ_API_KEY not set (server-only).");
  return k;
}

// --- tiny in-memory TTL cache (per server instance) ---
const cache = new Map<string, { v: unknown; exp: number }>();
function getCached<T>(k: string): T | undefined {
  const h = cache.get(k);
  if (!h) return undefined;
  if (Date.now() > h.exp) { cache.delete(k); return undefined; }
  return h.v as T;
}
function setCached(k: string, v: unknown, ttlMs: number) {
  cache.set(k, { v, exp: Date.now() + ttlMs });
}

// --- fetch with backoff on 429/5xx (per docs guidance) ---
async function req<T>(path: string, opts: { ttlMs?: number; params?: Record<string, string>; init?: RequestInit } = {}): Promise<T> {
  const url = new URL(BASE + path);
  if (opts.params) for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  const cacheKey = url.toString();
  if (opts.ttlMs) { const c = getCached<T>(cacheKey); if (c !== undefined) return c; }

  let attempt = 0;
  while (true) {
    const res = await fetch(url.toString(), {
      ...opts.init,
      headers: { "x-api-key": key(), ...(opts.init?.headers ?? {}) },
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as T;
      if (opts.ttlMs) setCached(cacheKey, json, opts.ttlMs);
      return json;
    }
    // Do not retry client errors (per docs): 400/401/403/404.
    if (res.status < 500 && res.status !== 429) {
      throw new Error(`tokens.xyz ${path} ${res.status}: ${await res.text().catch(() => "")}`);
    }
    if (attempt >= 3) throw new Error(`tokens.xyz ${path} ${res.status} after ${attempt} retries`);
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 120));
    attempt++;
  }
}

export async function searchAssets(q: string) {
  return req<{ results: { assetId: string; name: string; symbol: string }[] }>(
    "/assets/search", { params: { q }, ttlMs: 5 * 60_000 },
  );
}

export async function getVariants(assetId: string): Promise<TxzVariant[]> {
  const data = await req<TxzVariantsResponse>(
    `/assets/${encodeURIComponent(assetId)}/variants`, { ttlMs: 30_000 },
  );
  return data.variants ?? [];
}

// Curated universe. tokens.xyz lists: majors|lsts|currencies|rwas|etfs|metals|stocks
// Treasuries live under "rwas" (filter by kind if needed).
export type CuratedList = "stocks" | "etfs" | "metals" | "rwas";
export async function getCurated(list: CuratedList) {
  return req<{ assets: unknown[] }>("/assets/curated", { params: { list }, ttlMs: 5 * 60_000 });
}

export async function getTrending() {
  return req<{ assets: unknown[] }>("/assets/trending", { ttlMs: 60_000 });
}

export async function getOhlcv(assetId: string, interval = "1D") {
  return req<unknown>(`/assets/${encodeURIComponent(assetId)}/ohlcv`, {
    params: { interval }, ttlMs: 60_000,
  });
}

export async function getRiskSummary(assetId: string) {
  // Field schema not documented — log the first live response and extend types.
  return req<unknown>(`/assets/${encodeURIComponent(assetId)}/risk-summary`, { ttlMs: 5 * 60_000 });
}

// Batch price/market snapshots (≤250 mints) — use for portfolio pricing.
export async function marketSnapshots(mints: string[]) {
  return req<unknown>("/assets/market-snapshots", {
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mints }) },
  });
}

/** Resolve issuer display name from the messy real data (issuer often absent). */
export function resolveIssuer(v: TxzVariant): string {
  return v.issuer || v.label || v.tags?.[0] || "Unknown";
}
