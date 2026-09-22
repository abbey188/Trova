// Pyth market data — reference prices for valuation and for the on-chain vs real-world gap.
// Never scored; display and valuation only.
//
// Two sources, in order:
//   1. Hermes REST — needs PYTH_API_KEY (free plan at https://app.pyth.com/login-signup, 10s updates).
//      Since the 2026-08-26 Pyth Core upgrade, Hermes requires "Authorization: Bearer <key>".
//      Covers both equity feeds (Equity.US.AAPL/USD) and tokenized-stock feeds (Crypto.AAPLX/USD).
//   2. Solana price update accounts — key-free through our own RPC. Verified 2026-09-16: the live
//      sponsored equity feeds sit on shard 1 (AAPL/TSLA/NVDA/MSFT… ages 16–22s, within 0.07% of the
//      real price), while shard 0 carries legacy accounts that can be weeks stale — so we always take
//      the freshest shard and drop anything older than MAX_PRICE_AGE_SEC. Tokenized-stock feeds were
//      83h stale on-chain, so those effectively need Hermes.
//
// The feed catalogue (symbol → feed id) is public and needs no key.

import { address, getProgramDerivedAddress } from "@solana/kit";

const HERMES = process.env.PYTH_HERMES_URL || "https://hermes.pyth.network";
const CATALOG_URL = `${HERMES}/v2/price_feeds`;
const AUTH_URL = "https://pyth.dourolabs.app/auth/token";
const SYMBOLOGY_URL = "https://pyth.dourolabs.app/v1/symbols";
const ENTITLEMENT_TTL_MS = 60 * 60_000;
const PRICE_FEED_PROGRAM = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";
const SHARDS = [1, 0];
const CATALOG_TTL_MS = 6 * 60 * 60_000;

export const MAX_PRICE_AGE_SEC = 900;   // 15 minutes — older than this is not a usable reference price

export const equityFeed = (ticker: string) => `Equity.US.${ticker.toUpperCase()}/USD`;
export const tokenFeed = (symbol: string) => `Crypto.${symbol.toUpperCase()}/USD`;

export interface PythPrice {
  symbol: string;                 // e.g. "Equity.US.AAPL/USD"
  feedId: string;
  priceUsd: number;
  confUsd: number;                // publisher disagreement, not volatility
  publishTime: number;            // unix seconds
  ageSec: number;
  source: "hermes" | "solana";
  marketOpen?: boolean;           // from the feed's market hours, when known
}

interface CatalogEntry { id: string; marketOpen?: boolean }

let catalog: { at: number; bySymbol: Map<string, CatalogEntry> } | null = null;

function apiKey(): string | undefined {
  return process.env.PYTH_API_KEY || undefined;
}

function rpcUrl(): string {
  const url = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
  if (!url) throw new Error("Solana RPC URL not configured (HELIUS_RPC_URL / NEXT_PUBLIC_HELIUS_RPC_URL).");
  return url;
}

/** symbol → feed id for every Pyth feed (public endpoint). */
export async function getFeedCatalog(): Promise<Map<string, CatalogEntry>> {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.bySymbol;
  const key = apiKey();
  const res = await fetch(CATALOG_URL, { headers: key ? { Authorization: `Bearer ${key}` } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`pyth catalog ${res.status}`);
  const feeds = (await res.json()) as { id: string; market_hours?: { is_open?: boolean }; attributes?: { symbol?: string } }[];
  const bySymbol = new Map<string, CatalogEntry>();
  for (const f of feeds) {
    if (f.attributes?.symbol) bySymbol.set(f.attributes.symbol, { id: f.id, marketOpen: f.market_hours?.is_open });
  }
  catalog = { at: Date.now(), bySymbol };
  return bySymbol;
}

// --- Solana price update accounts (PriceUpdateV2), read through our own RPC ---

function parsePriceUpdate(data: Uint8Array, feedId: string): { priceUsd: number; confUsd: number; publishTime: number } | null {
  const id = Buffer.from(feedId, "hex");
  const buf = Buffer.from(data);
  const off = buf.indexOf(id);
  if (off < 0) return null;
  const expo = buf.readInt32LE(off + 48);
  const scale = 10 ** expo;
  return {
    priceUsd: Number(buf.readBigInt64LE(off + 32)) * scale,
    confUsd: Number(buf.readBigUInt64LE(off + 40)) * scale,
    publishTime: Number(buf.readBigInt64LE(off + 52)),
  };
}

async function priceAccount(feedId: string, shard: number): Promise<string> {
  const shardBytes = new Uint8Array(2);
  new DataView(shardBytes.buffer).setUint16(0, shard, true);
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(PRICE_FEED_PROGRAM),
    seeds: [shardBytes, Uint8Array.from(Buffer.from(feedId, "hex"))],
  });
  return pda;
}

async function readOnChain(feeds: { symbol: string; entry: CatalogEntry }[]): Promise<Map<string, PythPrice>> {
  const out = new Map<string, PythPrice>();
  if (!feeds.length) return out;

  const jobs: { symbol: string; feedId: string; marketOpen?: boolean; pda: string }[] = [];
  for (const f of feeds) {
    for (const shard of SHARDS) jobs.push({ symbol: f.symbol, feedId: f.entry.id, marketOpen: f.entry.marketOpen, pda: await priceAccount(f.entry.id, shard) });
  }

  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < jobs.length; i += 100) {
    const batch = jobs.slice(i, i + 100);
    const res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [batch.map((j) => j.pda), { encoding: "base64" }] }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`solana getMultipleAccounts ${res.status}`);
    const body = (await res.json()) as { result?: { value: ({ data: [string, string] } | null)[] }; error?: { message: string } };
    if (body.error) throw new Error(`solana getMultipleAccounts: ${body.error.message}`);
    body.result?.value.forEach((account, k) => {
      if (!account) return;
      const job = batch[k];
      const parsed = parsePriceUpdate(Buffer.from(account.data[0], "base64"), job.feedId);
      if (!parsed) return;
      const ageSec = Math.max(0, now - parsed.publishTime); // publishers can run a second ahead of us
      const prev = out.get(job.symbol);
      if (prev && prev.ageSec <= ageSec) return;      // keep the freshest shard
      out.set(job.symbol, { symbol: job.symbol, feedId: job.feedId, ...parsed, ageSec, source: "solana", marketOpen: job.marketOpen });
    });
  }
  return out;
}

// --- Entitlements ---
// A Pyth plan grants a specific set of feeds. Hermes rejects the WHOLE request with 403 if any id in
// it is outside the grant, so we must ask only for entitled feeds. The grant is published in the JWT
// minted by POST /auth/token (numeric Lazer ids), and the public symbology maps those to Hermes ids.
// The free plan grants 21 feeds (majors, FX, XAU/XAG, and only TSLA/QQQ/VOO among equities).

interface JwtGrants {
  entitlements?: { grants?: { selector?: { feed_ids?: number[] } }[] };
}

/** Lazer feed ids allowed by a minted token's grants. Exported for tests. */
export function grantedFeedIds(jwtPayload: JwtGrants): Set<number> {
  const ids = new Set<number>();
  for (const grant of jwtPayload.entitlements?.grants ?? []) {
    for (const id of grant.selector?.feed_ids ?? []) ids.add(id);
  }
  return ids;
}

function decodeJwtPayload(token: string): JwtGrants {
  const part = token.split(".")[1];
  if (!part) return {};
  return JSON.parse(Buffer.from(part, "base64url").toString()) as JwtGrants;
}

let entitled: { at: number; hermesIds: Set<string> } | null = null;

/** Hermes feed ids this API key may request. Empty when there's no key or discovery fails. */
async function getEntitledHermesIds(): Promise<Set<string>> {
  const key = apiKey();
  if (!key) return new Set();
  if (entitled && Date.now() - entitled.at < ENTITLEMENT_TTL_MS) return entitled.hermesIds;

  const hermesIds = new Set<string>();
  try {
    const tokenRes = await fetch(AUTH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (!tokenRes.ok) throw new Error(`pyth auth ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const lazerIds = grantedFeedIds(decodeJwtPayload(access_token));

    if (lazerIds.size) {
      const symbolsRes = await fetch(SYMBOLOGY_URL, { cache: "no-store" });
      if (!symbolsRes.ok) throw new Error(`pyth symbology ${symbolsRes.status}`);
      const symbols = (await symbolsRes.json()) as { pyth_lazer_id: number; hermes_id?: string }[];
      for (const s of symbols) {
        if (lazerIds.has(s.pyth_lazer_id) && s.hermes_id) hermesIds.add(s.hermes_id);
      }
    }
  } catch {
    // No entitlement info → skip Hermes entirely and read the on-chain accounts instead.
  }
  entitled = { at: Date.now(), hermesIds };
  return hermesIds;
}

// --- Hermes REST (needs an API key since the 2026-08-26 upgrade) ---

async function readHermes(allFeeds: { symbol: string; entry: CatalogEntry }[]): Promise<Map<string, PythPrice>> {
  const out = new Map<string, PythPrice>();
  const key = apiKey();
  if (!key || !allFeeds.length) return out;

  // One unentitled id fails the entire request, so request only what the plan grants.
  const allowed = await getEntitledHermesIds();
  const feeds = allFeeds.filter((f) => allowed.has(f.entry.id));
  if (!feeds.length) return out;

  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < feeds.length; i += 50) {
    const batch = feeds.slice(i, i + 50);
    const url = `${HERMES}/v2/updates/price/latest?${batch.map((f) => `ids[]=${f.entry.id}`).join("&")}&parsed=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`pyth hermes ${res.status}`);
    const body = (await res.json()) as { parsed?: { id: string; price: { price: string; conf: string; expo: number; publish_time: number } }[] };
    for (const p of body.parsed ?? []) {
      const feed = batch.find((f) => f.entry.id === p.id);
      if (!feed) continue;
      const scale = 10 ** p.price.expo;
      out.set(feed.symbol, {
        symbol: feed.symbol,
        feedId: p.id,
        priceUsd: Number(p.price.price) * scale,
        confUsd: Number(p.price.conf) * scale,
        publishTime: p.price.publish_time,
        ageSec: Math.max(0, now - p.price.publish_time), // publishers can run a second ahead of us
        source: "hermes",
        marketOpen: feed.entry.marketOpen,
      });
    }
  }
  return out;
}

/**
 * Latest Pyth prices for the given feed symbols, freshest source first and stale prices dropped.
 * Missing symbols simply don't appear in the result.
 */
export async function getPythPrices(symbols: string[]): Promise<Map<string, PythPrice>> {
  const wanted = [...new Set(symbols)];
  if (!wanted.length) return new Map();
  const cat = await getFeedCatalog();
  const feeds = wanted.map((symbol) => ({ symbol, entry: cat.get(symbol) })).filter((f): f is { symbol: string; entry: CatalogEntry } => !!f.entry);

  const prices = new Map<string, PythPrice>();
  if (apiKey()) {
    try {
      for (const [symbol, price] of await readHermes(feeds)) prices.set(symbol, price);
    } catch {
      // fall through to the on-chain accounts
    }
  }
  const missing = feeds.filter((f) => {
    const p = prices.get(f.symbol);
    return !p || p.ageSec > MAX_PRICE_AGE_SEC;
  });
  if (missing.length) {
    for (const [symbol, price] of await readOnChain(missing)) {
      const existing = prices.get(symbol);
      if (!existing || price.ageSec < existing.ageSec) prices.set(symbol, price);
    }
  }

  for (const [symbol, price] of prices) if (price.ageSec > MAX_PRICE_AGE_SEC) prices.delete(symbol);
  return prices;
}
