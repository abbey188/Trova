// Backpack Exchange public API — server-side, no auth. Trova's second data source so we
// never depend solely on tokens.xyz. Data only: Jupiter can't route to Backpack, and
// prices from here are display-only (never scored). Shapes validated live, 2026-09-15.

const BASE = "https://api.backpack.exchange/api/v1";

const cache = new Map<string, { v: unknown; exp: number }>();

async function get<T>(path: string, ttlMs: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() < hit.exp) return hit.v as T;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { cache: "no-store" });
    if (res.ok) {
      const v = (await res.json()) as T;
      cache.set(path, { v, exp: Date.now() + ttlMs });
      return v;
    }
    if ((res.status !== 429 && res.status < 500) || attempt >= 3) {
      throw new Error(`backpack ${path} ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 120));
  }
}

const HOURS_6 = 6 * 60 * 60_000;

export interface BpSecurity {
  asset: string;                // "TSLA.US"
  cusip: string;
  name: string;                 // "Tesla, Inc."
  sessions: { name: string; minQuantity: string; maxQuantity: string; stepSize: string }[];
}

export interface BpTicker {
  symbol: string;               // "TSLA.US_USDC"
  firstPrice: string;
  lastPrice: string;
  high: string;
  low: string;
  priceChange: string;
  priceChangePercent: string;   // fraction, e.g. "-0.0147"
  volume: string;
  quoteVolume: string;
  trades: string;
}

export interface BpKline {
  start: string;
  end: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  trades: string;
}

interface BpAsset {
  symbol: string;
  displayName: string;
  tokens?: { blockchain: string; contractAddress: string | null }[];
}

/** US securities Backpack lists (≈1,148), keyed by ticker without ".US". */
export async function getSecurities(): Promise<Map<string, BpSecurity>> {
  const list = await get<BpSecurity[]>("/securities", HOURS_6);
  return new Map(list.map((s) => [s.asset.replace(/\.US$/, "").toUpperCase(), s]));
}

/** True when the company is publicly listed (appears in Backpack's securities list). */
export async function isListedTicker(ticker: string): Promise<boolean> {
  return (await getSecurities()).has(ticker.toUpperCase());
}

/** Solana mints of Backpack-issued ".US" tokens — confirms issuer independently of tokens.xyz. */
export async function getBackpackIssuedMints(): Promise<Set<string>> {
  const assets = await get<BpAsset[]>("/assets", HOURS_6);
  return new Set(
    assets
      .filter((a) => a.symbol.endsWith(".US"))
      .flatMap((a) => (a.tokens ?? []).filter((t) => t.blockchain === "Solana" && t.contractAddress).map((t) => t.contractAddress!)),
  );
}

/** Real (external) stock prices for all listed US stocks/ETFs in one call, keyed by ticker. */
export async function getExternalTickers(): Promise<Map<string, BpTicker>> {
  const list = await get<BpTicker[]>("/tickers?source=External", 60_000);
  return new Map(list.map((t) => [t.symbol.replace(/\.US_USDC$/, "").toUpperCase(), t]));
}

/** Real stock price history (external source). interval e.g. "1h" | "1d"; startTime in unix seconds. */
export async function getExternalKlines(ticker: string, interval: string, startTime: number): Promise<BpKline[]> {
  const symbol = `${ticker.toUpperCase()}.US_USDC`;
  return get<BpKline[]>(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&startTime=${startTime}&source=External`, 5 * 60_000);
}
