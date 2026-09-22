// Trova domain types. Derived from REAL tokens.xyz /assets/:id/variants responses
// (validated against solana + tesla, 2026-09-15).

export type Tier = "tier1" | "tier2" | "tier3"; // "experimental" is a legacy alias for tier3
export type StockVariantTier = "share_redeemable" | "cash_redeemable" | "not_redeemable";

// ---- Raw shapes as returned by tokens.xyz (map, don't consume directly) ----

export interface TxzMarket {
  price: number;
  liquidity: number;            // USD depth/TVL proxy
  volume1hUSD?: number;
  volume24hUSD?: number;
  trade1h?: number;
  trade24h?: number;
  uniqueWallet1h?: number;
  uniqueWallet24h?: number;
  marketCap?: number;
  fdv?: number;
  holder?: number;
  totalSupply?: number;
  circulatingSupply?: number;
  priceChange1hPercent?: number;
  priceChange24hPercent?: number;
  decimals: number;
  logoURI?: string;
  lastTradeAt?: number;
  source?: string;
}

export interface TxzExecutionQuality {
  executionScore: number;       // 0..100
  botVolumeRatio?: number;      // 0..1 (0.90 = 90% bot/MM flow)
  botVolume24hUSD?: number;
  volume24hUSD?: number;
  markoutBps?: number;
  feeBps?: number;
  flowSourceCount?: number;
  isEligibleForPrimary?: boolean;
}

export interface TxzVariant {
  variantId: string;
  mint: string;
  kind: string;                 // "tokenized_equity" | "native" | "yield" | "etf" | ...
  tags?: string[];
  label?: string;
  name: string;
  symbol: string;
  issuer?: string;
  trustTier?: Tier;             // deprecated alias — prefer liquidityTier
  liquidityTier?: Tier;
  stockVariantTier?: StockVariantTier | null;
  advisory?: unknown | null;    // risk warnings when populated
  executionQuality?: TxzExecutionQuality | null;
  market: TxzMarket;
}

export interface TxzVariantsResponse {
  assetId: string;
  sortBy?: string;
  variants: TxzVariant[];
}

// ---- Trova normalized types ----

export interface ScoreComponents {
  liquidity: number;      // 0..100
  execution: number;      // 0..100
  redeemability: number;  // 0..100
  maturity: number;       // 0..100
}

export interface TrovaScore {
  score: number;          // 0..100 after tier cap
  tier: Tier;
  tierCap: number;
  components: ScoreComponents;
  routable: boolean;
  isPrimary: boolean;     // tokens.xyz isEligibleForPrimary
  rejectReason?: string;
  flags: string[];        // e.g. ["bot-heavy","thin-liquidity","not-redeemable"]
}

export interface Variant {
  variantId: string;
  mint: string;
  assetId: string;
  kind: string;
  issuer: string;         // resolved: issuer ?? label ?? first tag ?? "Unknown"
  symbol: string;
  name: string;
  tier: Tier;
  stockVariantTier?: StockVariantTier | null;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  organicVolume24hUsd: number; // volume * (1 - botVolumeRatio) when available
  botVolumeRatio?: number;
  executionScore?: number;
  holders?: number;
  logoURI?: string;
  score: TrovaScore;
}

export interface Asset {
  assetId: string;
  name: string;
  symbol: string;
  assetClass: "stock" | "etf" | "metal" | "treasury" | "crypto" | "other";
}

export interface Holding {
  asset: Asset;
  variant: Variant;       // the variant actually held
  amount: number;
  valueUsd: number;
  returnPct?: number;
  betterVariant?: Variant | null; // safest routable variant to de-risk into
}

export type SignalKind = "tier-drop" | "score-drop" | "concentration" | "thin-liquidity" | "bot-heavy" | "not-redeemable";

export interface Signal {
  kind: SignalKind;
  severity: "info" | "warn" | "danger";
  assetId?: string;
  message: string;
}

export interface PortfolioSummary {
  totalValueUsd: number;
  trustScore: number;     // value-weighted 0..100
  atRiskUsd: number;
  allocationByTier: Record<Tier, number>;      // % of value
  allocationByClass: Record<string, number>;   // % of value
  holdings: Holding[];
  signals: Signal[];
}
