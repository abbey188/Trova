// tokens.xyz Assets API client — server-side only (holds the key).
// Base + auth + endpoints validated against docs.tokens.xyz (2026-09-15).
// Real response shapes validated against live solana + tesla payloads.

import type { TxzAsset, TxzExecutionQuality, TxzMarket, TxzVariant, TxzVariantsResponse } from "./types";

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

/** Canonical asset detail — includes canonicalMarket (source "prestocks" = pre-IPO, with private marks). */
export async function getAsset(assetId: string): Promise<TxzAsset | null> {
  const data = await req<{ asset?: TxzAsset }>(`/assets/${encodeURIComponent(assetId)}`, { ttlMs: 5 * 60_000 });
  return data.asset ?? null;
}

// --- Mint lookups (shapes validated against live responses, 2026-09-15) ---

export interface TxzResolveResponse {
  assetId: string;              // canonical id, or singleton "solana-<mint>" when unmapped
  resolvedBy: string;           // e.g. "mint"
  mint?: string;
  asset?: { assetId: string; name: string; symbol: string; category?: string; aliases?: string[] };
  variant?: Partial<TxzVariant> & { chain?: string; issuerUrl?: string }; // no market data here
}

/** Map a wallet mint to its canonical asset (+ tier/advisory metadata, no market). */
export async function resolveMint(mint: string): Promise<TxzResolveResponse> {
  return req<TxzResolveResponse>("/assets/resolve", { params: { mint }, ttlMs: 10 * 60_000 });
}

export interface TxzVariantMarket {
  mint: string;
  assetId: string;
  chain?: string;
  market: TxzMarket;
  executionQuality?: TxzExecutionQuality | null;
  advisory?: unknown | null;
}

/** Per-mint market data, batched (API max 50 mints per call). Use this, not
 *  market-snapshots, to price stock holdings — snapshots return hasMarket:false for them. */
export async function getVariantMarkets(mints: string[]): Promise<TxzVariantMarket[]> {
  const unique = [...new Set(mints)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));
  const pages = await Promise.all(chunks.map((c) =>
    req<{ variants: TxzVariantMarket[] }>("/assets/variant-markets", { params: { mints: c.join(",") }, ttlMs: 30_000 }),
  ));
  return pages.flatMap((p) => p.variants ?? []);
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

/**
 * Candles for an asset. MEASURED 2026-09-24: without an explicit range this returns only SIX
 * candles — `days` and `limit` are both ignored, `from`/`to` (unix seconds) are what widen it.
 * 1W returns nothing at all; 1H works. So a 90-day chart must pass a range or it silently shows
 * a week.
 *
 * Without `mint` the candles are the asset's PRIMARY variant (TSLAx for Tesla). `mint=` returns that
 * variant's own series — required for a holding, or TSLAon would be charted with TSLAx's prices.
 */
export async function getOhlcv(
  assetId: string,
  interval = "1D",
  { from, to, mint }: { from?: number; to?: number; mint?: string } = {},
) {
  const params: Record<string, string> = { interval };
  if (from) params.from = String(Math.floor(from));
  if (to) params.to = String(Math.floor(to));
  if (mint) params.mint = mint;
  return req<TxzOhlcv>(`/assets/${encodeURIComponent(assetId)}/ohlcv`, { params, ttlMs: 60_000 });
}

export interface TxzOhlcv {
  assetId: string;
  mint: string;
  interval: string;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
}

/**
 * tokens.xyz's own market risk score. Schema validated live 2026-09-24.
 *
 * Its four components are liquidityHealth, holderDistribution, tradingActivity and holderCount —
 * every one a market metric, none structural. That is exactly why it returns score 100 / grade A /
 * "Established" for Tesla, SpaceX and OpenAI alike, and why Trova shows it beside our rating rather
 * than inside it.
 */
export async function getRiskSummary(assetId: string) {
  return req<TxzRiskSummary>(`/assets/${encodeURIComponent(assetId)}/risk-summary`, { ttlMs: 5 * 60_000 });
}

export interface TxzRiskSummary {
  assetId: string;
  mint: string;
  risk: {
    ok: boolean;
    marketScore: {
      score: number | null;
      grade: string | null;
      label: string | null;
      tone: string | null;
      caps: unknown[];
      hasInsufficientData: boolean;
      insufficientDataReason: string | null;
      components: Record<string, { score: number | null; status: string | null; hasData: boolean }>;
    } | null;
    lastUpdatedAt?: number;
  } | null;
}

// Batch price/market snapshots (≤250 mints) — use for portfolio pricing.
export async function marketSnapshots(mints: string[]) {
  return req<unknown>("/assets/market-snapshots", {
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mints }) },
  });
}

/** Resolve issuer display name from the messy real data (issuer present for ~3% of stocks).
 *  Never returns internal list tags like "curated:etfs". Backpack's mint list can
 *  override this upstream when it confirms the issuer. */
export function resolveIssuer(v: TxzVariant): string {
  if (v.issuer) return v.issuer;
  if (v.label) return v.label;
  const tag = v.tags?.find((t) => !t.startsWith("curated:"));
  if (tag) return tag;
  // Issuer symbol conventions: xStocks "TSLAx", Ondo "TSLAon".
  if (/[A-Z]on$/.test(v.symbol)) return "Ondo";
  if (/[A-Z]x$/.test(v.symbol)) return "xStock";
  return "Unknown";
}
