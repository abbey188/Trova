// Trova domain types. Raw shapes derived from REAL tokens.xyz responses
// (validated against live stocks/etfs/metals/rwas payloads, 2026-09-15).

// tokens.xyz liquidityTier is a LIQUIDITY grade only (not safety). Label it
// neutrally as "Tier 1/2/3" — never "experimental"/bad.
export type Tier = "tier1" | "tier2" | "tier3";
export type StockVariantTier = "share_redeemable" | "cash_redeemable" | "not_redeemable";
export type AdvisoryStatus = "caution" | "compromised" | "blocked";

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
  metricsSource?: string;
}

export interface TxzExecutionQuality {
  executionScore: number;       // 0..100 (24h fill volume, trades, flow sources, bot ratio, fees)
  botVolumeRatio?: number;      // 0..1 (0.90 = 90% bot/MM flow)
  botVolume24hUSD?: number;
  volume24hUSD?: number;
  markoutBps?: number;
  feeBps?: number;
  flowSourceCount?: number;
  isEligibleForPrimary?: boolean;
}

export interface TxzAdvisory {
  status: AdvisoryStatus;       // compromised → excluded from primary; blocked → hidden from lists
  reason?: string | null;       // operator text, show verbatim
  url?: string | null;
  since?: number | null;        // unix ms
}

export interface TxzVariant {
  variantId: string;
  mint: string;
  kind: string;                 // "tokenized_equity" | "etf" | "leveraged" | "spot" | "wrapped" | "basket" | "yield" | "native"
  tags?: string[];
  label?: string;
  name: string;
  symbol: string;
  issuer?: string;              // present for only ~3% of stocks — see resolveIssuer()
  issuerUrl?: string;
  trustTier?: Tier;             // deprecated alias — prefer liquidityTier
  liquidityTier?: Tier;
  stockVariantTier?: StockVariantTier | null;
  advisory?: TxzAdvisory | null;
  executionQuality?: TxzExecutionQuality | null;
  market: TxzMarket;
}

export interface TxzVariantsResponse {
  assetId: string;
  sortBy?: string;
  variants: TxzVariant[];
}

/** Asset-level reference market. source "prestocks" = private company priced against
 *  private valuation marks (pre-IPO), not a public listing. */
export interface TxzCanonicalMarket {
  source?: string;              // "clickhouse_stock" | "coingecko" | "prestocks" | ...
  symbol?: string;
  mint?: string;
  price?: number;
  marketCap?: number;
  markPriceUsd?: number;        // pre-IPO: price implied by the last private mark
  markValuationUsd?: number;    // pre-IPO: last private valuation
  impliedValuationUsd?: number; // pre-IPO: valuation implied by the token price
  premiumToMarkPercent?: number;
  asOf?: number;
}

export interface TxzAsset {
  assetId: string;
  name: string;
  symbol: string;
  category?: string;            // "equity" | "commodity" | "rwa" | ...
  aliases?: string[];
  imageUrl?: string;
  stats?: Partial<TxzMarket> & { volume30dUSD?: number };
  canonicalMarket?: TxzCanonicalMarket | null;
  advisories?: TxzAdvisory[];
  primaryVariantStrategy?: string;
}

// ---- Trova Score v3.1 (see lib/trust-score.ts) ----

export type Grade = "A" | "B" | "C" | "D";
export type Rating = Grade | "NR";  // NR = not rated: too little reported data to score honestly
export type Confidence = "high" | "medium" | "low";

/** What the token legally/structurally is. Classified BEFORE scoring; classes can cap the score. */
export type InstrumentClass =
  | "direct-share"              // share_redeemable, listed company
  | "backed-tracker"            // cash_redeemable
  | "non-redeemable-listed"     // not_redeemable, but the company is publicly listed
  | "unreported"                // no redemption path reported (funds, commodities, …)
  | "leveraged"                 // daily-reset leveraged product
  | "pre-ipo-exposure";         // SPV exposure to a private company — speculative

export interface InstrumentInfo {
  class: InstrumentClass;
  label: string;                // short UI label
  summary: string;              // factual one-liner for the safety report
  speculative: boolean;         // must be labelled speculative wherever shown
}

/** How the redemption value was obtained: reported by tokens.xyz, taken from the most conservative
 *  value reported by same-class peers, or the neutral midpoint when no peers report one. */
export type RedemptionBasis = "reported" | "class-peers" | "neutral";

/** "What do I actually own?" — slow-changing, matters most for long-term holds. */
export interface OwnershipComponents {
  redemption: number;           // share 100 / cash 75 / not redeemable 30 / unreported: class peers or neutral 50
  redemptionReported: boolean;
  redemptionBasis: RedemptionBasis;
  product: number;              // product rights: full exposure 100 / leveraged 40 / SPV, no ownership rights 0
}

/** "Can I get in and out at a fair price?" — one factor, calibrated against tradable peers. */
export interface ExitComponents {
  liquidity: number;            // 0..100, 50 = median tradable variant
  activity: number;             // trades + volume (24h)
  holders: number;
  execution: number | null;     // tokens.xyz executionScore when reported
}

export interface PillarScore<C> {
  score: number;                // 0..100
  grade: Grade;
  components: C;
}

export type ScoreFlag =
  | "advisory-caution" | "advisory-compromised" | "advisory-blocked"
  | "pre-ipo-exposure" | "speculative"
  | "not-redeemable" | "redemption-unreported" | "leveraged"
  | "thin-liquidity" | "no-recent-trades" | "high-bot-share" | "issuer-unnamed"
  | "not-rated" | "short-history" | "borderline";

export interface TrovaScore {
  score: number | null;         // combined 0..100 = geometric mean of the pillars (advisory caps only); null when not rated
  grade: Rating;
  borderline: { cutoff: number; adjacentGrade: Grade } | null; // within 3 points of a grade cutoff
  rated: boolean;
  notRatedReason?: string;
  instrument: InstrumentInfo;
  confidence: Confidence;       // how complete the underlying data is
  ownership: PillarScore<OwnershipComponents>;
  exit: PillarScore<ExitComponents>;
  tier: Tier;                   // neutral display label only — never scored
  advisory: TxzAdvisory | null;
  routable: boolean;            // can Trova route a trade into it right now
  notRoutableReason?: string;
  hidden: boolean;              // advisory "blocked"
  issuerConfirmed: boolean;     // confirmed by an independent source (e.g. Backpack's mint list)
  isPrimary: boolean;           // tokens.xyz isEligibleForPrimary (tiebreak only)
  flags: ScoreFlag[];
  methodVersion: string;
}

/**
 * A balance change the issuer scheduled on the mint itself (Token-2022 scaled UI amount).
 * A split or a distribution shows up here before any announcement — see lib/token-extensions.ts.
 */
export interface CorporateAction {
  multiplier: number;            // in force now
  newMultiplier: number;         // takes over at effectiveAt
  effectiveAt: number | null;    // unix ms, null when nothing is scheduled
  pending: boolean;              // a different multiplier is queued for a future date
}

/** What a round trip costs at a given size, quoted through Jupiter both ways. */
export interface ExitQuote {
  /** "ok" measured, "no-route" cannot be sold at this size, "unavailable" we could not reach Jupiter. */
  status: "ok" | "no-route" | "unavailable";
  roundTripPct: number | null;
  routable: boolean;
  usdSize: number;
  routeLabels: string[];
}

export interface Variant {
  variantId: string;
  mint: string;
  assetId: string;
  kind: string;
  issuer: string;               // resolved via resolveIssuer() (+ Backpack cross-check)
  symbol: string;
  name: string;
  tier: Tier;
  stockVariantTier?: StockVariantTier | null;
  priceUsd: number;             // display only — never scored
  liquidityUsd: number;
  volume24hUsd: number;
  organicVolume24hUsd: number;  // volume * (1 - botVolumeRatio) when available
  botVolumeRatio?: number;
  executionScore?: number;
  holders?: number;
  /** Scheduled or applied balance change on the mint; null when the token has no such extension. */
  corporateAction?: CorporateAction | null;
  logoURI?: string;
  score: TrovaScore;
}

export interface Asset {
  assetId: string;
  name: string;
  symbol: string;
  /** CUSIP where an independent source carries one (Backpack lists ~50 of 1,166); null otherwise. */
  cusip?: string | null;
  assetClass: "stock" | "etf" | "metal" | "rwa" | "treasury" | "crypto" | "other";
}

export interface Holding {
  asset: Asset;
  variant: Variant;             // the variant actually held
  amount: number;
  valueUsd: number;             // 0 when the holding can't be valued (see valuation.source "unknown")
  /** How the holding was priced: the variant's own market, a real stock price (Pyth, else Backpack),
   *  or not at all. Dead variants keep quoting a stale last trade, so their own price isn't trusted. */
  valuation: { priceUsd: number | null; source: "market" | "pyth" | "backpack" | "unknown"; stale: boolean };
  /** Measured cost to leave this position at its current size. */
  exitQuote?: ExitQuote | null;
  /** What selling this exact balance returns right now, one way to USDC. The holder's number. */
  sellNow?: { status: "ok" | "no-route" | "unavailable"; receivedUsd: number | null; lossPct: number | null; routeLabels: string[] } | null;
  /** Daily rating history for the held variant, oldest first. */
  history?: VariantHistory | null;
  returnPct?: number;
  betterVariant?: Variant | null; // highest-scoring routable variant of the same asset, if better
  closeCall?: boolean;          // best pick is within CLOSE_CALL_MARGIN of the runner-up
}

/** One row on the markets screen. `grade` null means we have never snapshotted it — unrated, not bad. */
export interface MarketRow {
  assetId: string;
  mint: string | null;
  symbol: string;
  name: string;
  category: string | null;
  logoUrl: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPercent: number | null;
  score: number | null;
  grade: Rating | null;
  speculative: boolean;
  routable: boolean | null;
  hasAdvisory: boolean;
}

/** The markets screen. Each section degrades on its own. */
export interface MarketsOverview {
  asOf: number;
  trending: MarketRow[];
  lists: { list: string; rows: MarketRow[] }[];
  warnings: string[];
}

/** One OHLCV candle. `time` is unix SECONDS, as tokens.xyz returns it. */
export interface Candle {
  time: number;
  open: number; high: number; low: number; close: number;
  volume: number;
}

/** Price history for the chart. Token price and the real stock price are separate series:
 *  they are only the same thing when the token actually tracks 1:1, which is the point. */
export interface PriceHistory {
  interval: string;
  /** The token's own on-chain price. */
  token: Candle[];
  /** The listed stock's real price, when the two are comparable 1:1. Null otherwise. */
  reference: { ticker: string; closes: { time: number; close: number }[] } | null;
}

/**
 * Somebody else's rating of the same token — tokens.xyz's market risk score.
 *
 * Carried so the two ratings can sit side by side. Every component it scores is a market metric
 * (liquidity, holder distribution, trading activity, holder count), which is why it rates pre-IPO
 * SPV exposure and a share-redeemable tracker identically. Never blended into the Trova Score.
 */
export interface ExternalRating {
  source: "tokens.xyz";
  score: number | null;
  grade: string | null;
  label: string | null;             // e.g. "Established"
  tone: string | null;              // e.g. "safe"
  /** Their sub-scores, each flagged with whether it measures the market or the instrument. */
  components: { key: string; score: number | null; status: string | null; measures: "market" | "structure" }[];
  insufficientData: boolean;
  updatedAt: number | null;
}

/** One day of a variant's rating history. A missing day is an absent point, never a zero. */
export interface HistoryPoint {
  date: string;                 // YYYY-MM-DD (the snapshot day)
  score: number | null;         // null = not rated that day
  grade: Rating;
  ownership: number;
  exit: number;
  liquidityUsd: number | null;
  holders: number | null;
  volume24hUsd: number | null;
  routable: boolean;
}

/** What a history series says, as facts about the move that happened — never an expected one. */
export interface TrendSummary {
  days: number;                 // points we actually have, not calendar days
  scoreChange: number | null;   // last minus first, in points
  scoreFrom: number | null;
  scoreTo: number | null;
  liquidityChangePct: number | null;
  holdersChange: number | null;
  direction: "up" | "down" | "flat";
  /** Nothing moved at all across the window — how a dead token reads. */
  flat: boolean;
  gradeChanged: boolean;
  lostRoutability: boolean;
}

/** A variant's daily history, oldest first, with its trend. */
export interface VariantHistory {
  mint: string;
  assetId: string;
  symbol: string;
  points: HistoryPoint[];
  trend: TrendSummary;
}

/** What Trova watched across the whole universe — the monitoring proof on the home screen. */
export interface MonitoringStats {
  windowDays: number;
  historyDays: number;
  latestDate: string | null;
  variantsTracked: number;
  ratingsChangedAndHeld: number;
  becameUntradable: number;
  tierMoves: number;
  newVariants: number;
}

/** One point in a variant's score history — powers "what changed" over time. */
export interface VariantSnapshot {
  mint: string;
  assetId: string;
  takenAt: number;              // unix ms
  methodVersion: string;
  score: number | null;
  grade: Rating;
  instrumentClass: InstrumentClass;
  ownership: number;
  exit: number;
  tier: Tier;
  stockVariantTier: StockVariantTier | null;
  advisoryStatus: AdvisoryStatus | null;
  liquidityUsd: number;
  holders: number;
}

export type SignalKind =
  // change over time (lib/signals.ts, from daily snapshots)
  | "grade-change" | "ownership-change" | "exit-change" | "redemption-change"
  | "advisory" | "tier-change" | "routability-change"
  // current portfolio (lib/portfolio.ts)
  | "concentration" | "speculative" | "not-routable" | "better-variant" | "stale-price"
  // a token that did not exist in the previous snapshot (lib/signals.ts)
  | "new-variant";

export interface Signal {
  kind: SignalKind;
  severity: "info" | "warn" | "danger";
  assetId?: string;
  mint?: string;
  symbol?: string;
  message: string;              // factual, never predictive
  detectedAt?: number;          // unix ms (snapshot day) for change signals
  from?: string;
  to?: string;
}

export interface CashBalance {
  symbol: string;               // SOL | USDC | USDT
  mint: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

/** What one unit of the reference price is: one listed share, or one troy ounce. */
export type PriceBasis = "share" | "ounce";

/** Real-world price used for comparison (display only, never scored). */
export interface PriceReference {
  ticker: string;               // e.g. "TSLA", or "XAU" for per-ounce metals
  priceUsd: number;
  source: "pyth" | "backpack";
  basis: PriceBasis;
  confUsd: number | null;       // Pyth publisher disagreement
  ageSec: number | null;
  marketOpen: boolean | null;
  feedSymbol: string | null;    // e.g. "Equity.US.TSLA/USD"
}

export interface AssetVariantView extends Variant {
  isBest: boolean;
  /** Daily rating history behind the chart, oldest first. Null when we have never snapshotted it. */
  history?: VariantHistory | null;
  /** Measured cost to get in and back out, at a few sizes. Best variant only. */
  exitLadder?: ExitQuote[];
  /** On-chain price vs the reference, in %; null when the two aren't comparable 1:1. */
  gapPercent: number | null;
  redemptionNote: string | null;
}

export interface AssetDetail {
  asset: Asset;
  asOf: number;
  methodVersion: string;
  stats: {
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    volume30dUsd: number | null;
    marketCapUsd: number | null;
    priceChange24hPercent: number | null;
    holders: number | null;
  } | null;
  reference: PriceReference | null;
  /** Pre-IPO only: last private valuation vs the valuation the token price implies. */
  privateMark: { markValuationUsd: number; impliedValuationUsd: number | null; premiumToMarkPercent: number | null; asOf: number | null } | null;
  variants: AssetVariantView[];
  best: { mint: string; symbol: string; closeCall: boolean; runnerUpMint: string | null } | null;
  /** Another rater's verdict on the same asset, shown beside ours — never folded into it. */
  externalRating: ExternalRating | null;
  /** Real price history for the chart. Null when no source had any. */
  priceHistory: PriceHistory | null;
  signals: Signal[];
  historyDays: number;
  warnings: string[];
}

export interface PortfolioSummary {
  wallet: string;
  asOf: number;
  methodVersion: string;
  totalValueUsd: number;        // tokenized holdings only (not cash)
  cashValueUsd: number;
  cash: CashBalance[];
  otherTokens: number;          // tokens outside Trova's curated universe (not scored)
  scores: { overall: number; ownership: number; exit: number }; // value-weighted 0..100, rated holdings only
  needsAttentionUsd: number;    // value in holdings that are not routable, grade D, not rated, or under an advisory
  speculativeUsd: number;       // value in speculative instruments (pre-IPO exposure)
  allocationByGrade: Record<Rating, number>;    // % of holdings value
  allocationByTier: Record<Tier, number>;       // % of holdings value
  allocationByClass: Record<string, number>;    // % of holdings value
  holdings: Holding[];
  signals: Signal[];
  historyDays: number;          // days of snapshot history behind change signals
  warnings: string[];           // optional sources that were unavailable
}
