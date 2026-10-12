// Live check of the exit measurement against Jupiter: both routes, the better one kept, and the
// reason when there is no quote. Run with `pnpm verify:exit`. Needs JUPITER_API_KEY — without it the
// order route is never asked and every token reads as pools alone.
//
// These are observations of a live market, so the assertions are deliberately loose: a market-maker
// filled token must cost far less than its pools say, and a token that is shut for the night must
// say so instead of reporting a loss. Nothing is asserted about CLSKx, once our example of a token
// that could not be left: on 2026-10-12 a $500 round trip in it cost 99.98% at about 01:50 UTC, when
// no market maker would buy it back, and 1.0% at about 02:10 UTC, when one would. Whether a thin token can be left
// depends on the hour, which is why the measurement is stored by market session.

import { exitCeiling, exitCost, exitLadder, sellNow } from "../lib/jupiter";

const TOKENS = {
  TSLAx: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  TSLAon: "KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo",
  NFLXon: "g4KnPrxPLeeKkwvDmZFMtYQPM64eHeShbD55vK6ondo",
  CLSKx: "Xsn3H7ACEpSF2ULxeiD6kW4jRZXpurh8ZPttyfoS56W",
  OPENAI: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
} as const;

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(3)}%`);
const failures: string[] = [];
const expect = (ok: boolean, what: string) => { if (!ok) failures.push(what); };

async function main() {
  if (!process.env.JUPITER_API_KEY) console.warn("JUPITER_API_KEY is not set: only the pool route will be asked.");

  for (const [symbol, mint] of Object.entries(TOKENS)) {
    const c = await exitCost(mint, 500);
    console.log(`${symbol.padEnd(7)} $500  ${c.status.padEnd(13)} best ${pct(c.roundTripPct).padEnd(9)} pools alone ${pct(c.poolsRoundTripPct).padEnd(9)} filled by ${c.liquidity ?? "—"}  ${c.routeLabels.join("+")}`);

    if (symbol === "TSLAx") expect(c.status === "ok" && (c.roundTripPct ?? 99) < 1, "TSLAx should round-trip $500 for under 1%");
    if (symbol === "TSLAon" || symbol === "NFLXon") {
      // Either it trades through a market maker for well under what its pools say, or it is shut.
      expect(c.status === "market-closed" || (c.status === "ok" && (c.roundTripPct ?? 99) < 2), `${symbol} should be cheap through a market maker, or report market-closed`);
      expect(!(c.status === "ok" && (c.roundTripPct ?? 0) > 10), `${symbol} must not report its pool-only loss as the exit cost`);
    }
  }

  for (const symbol of ["TSLAx", "TSLAon"] as const) {
    const ladder = await exitLadder(TOKENS[symbol], [500, 5_000, 50_000, 250_000, 1_000_000]);
    console.log(`${symbol} ladder: ${ladder.map((l) => `$${l.usdSize.toLocaleString()} ${l.status === "ok" ? pct(l.roundTripPct) : l.status}`).join(" · ")}`);
    console.log(`${symbol} ceilings: under 1% ${JSON.stringify(exitCeiling(ladder, 1))} · under 5% ${JSON.stringify(exitCeiling(ladder, 5))}`);
  }

  // 3.2 TSLAon, the demo holding (9 decimals).
  const sale = await sellNow(TOKENS.TSLAon, 3_200_000_000n, 0);
  console.log(`sell 3.2 TSLAon: ${sale.status} $${sale.receivedUsd?.toFixed(2) ?? "—"} via ${sale.liquidity ?? "—"}`);
  expect(sale.status === "market-closed" || (sale.status === "ok" && (sale.receivedUsd ?? 0) > 100), "selling 3.2 TSLAon should return a real amount, or report market-closed");

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nAll exit checks passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
