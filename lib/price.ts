// Which price is a token's price. Display and valuation only — price never touches the score.
//
// tokens.xyz's `market.price` is usually where the token trades, but not always. For some pre-IPO
// variants it is the ISSUER'S reference price: measured 2026-09-25, OPENAI listed at $1,361.00 —
// exactly PreStocks' canonical price — while its on-chain trades closed at $1,984.84 and Jupiter
// paid $1,984 a unit to sell. A holder valued at the listed price is undervalued by a third, and a
// "valuation this token implies" computed from it describes a price nobody is trading at.
//
// So the listed price stands unless the token's own recent trades clearly disagree with it. Three
// conditions, all required, so one stray fill in a thin market can never reprice anything:
//   recent  — the last close is at most TRADES_FRESH_MS old
//   heavy   — at least MIN_TRADES_24H trades in the last day
//   clear   — the two differ by more than DIVERGENCE

export const TRADES_FRESH_MS = 36 * 3_600_000;
export const MIN_TRADES_24H = 50;
export const DIVERGENCE = 0.25;

export interface PriceChoice {
  priceUsd: number | null;
  /** "listed" = tokens.xyz's price stands; "trades" = replaced by where the token actually traded. */
  basis: "listed" | "trades";
  listedUsd: number | null;
  tradedUsd: number | null;
  /** Traded vs listed, in %, when both exist. Positive = trades above the listed price. */
  gapPct: number | null;
}

/**
 * @param listed    tokens.xyz's market.price
 * @param lastClose the token's own most recent close; `time` in unix SECONDS and the END of the
 *                  candle — a candle is stamped at its start, so callers add its length
 * @param trades24h trades in the last day
 */
export function choosePrice(
  listed: number | null | undefined,
  lastClose: { time: number; close: number } | null | undefined,
  trades24h: number | null | undefined,
  now = Date.now(),
): PriceChoice {
  const listedUsd = typeof listed === "number" && listed > 0 ? listed : null;
  const tradedUsd = lastClose && lastClose.close > 0 ? lastClose.close : null;
  const gapPct = listedUsd != null && tradedUsd != null ? (tradedUsd / listedUsd - 1) * 100 : null;

  const recent = lastClose != null && now - lastClose.time * 1000 <= TRADES_FRESH_MS;
  const heavy = (trades24h ?? 0) >= MIN_TRADES_24H;
  const clear = gapPct != null && Math.abs(gapPct) > DIVERGENCE * 100;

  if (tradedUsd != null && recent && heavy && (clear || listedUsd == null)) {
    return { priceUsd: tradedUsd, basis: "trades", listedUsd, tradedUsd, gapPct };
  }
  return { priceUsd: listedUsd, basis: "listed", listedUsd, tradedUsd, gapPct };
}
