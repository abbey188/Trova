// What the measured Exit does to the ratings. Run: pnpm diagnostics
//
// Re-scores the latest stored snapshot twice from its raw inputs — once on pool depth alone (the v3
// rule) and once with the stored exit measurements (v4) — and prints what moved. Read-only.
// Run it after any change to the method, and bump METHOD_VERSION when the output changes.
//
// It answers three questions:
//   1. Calibration — do the capacity anchors still put the median tradable token near 50?
//   2. Movement    — which grades change, in which direction, and for which issuers?
//   3. Review      — the most widely held tokens, before and after, to be read by a person.

import { forScore, latestMeasurements } from "../lib/exit-store";
import { selectRows } from "../lib/supabase-rest";
import { METHOD_VERSION, measuredFacts, scoreVariant, type ScoreContext } from "../lib/trust-score";
import type { TxzVariant } from "../lib/types";
import { getCuratedUniverse } from "../lib/universe";

interface Stored { mint: string; symbol: string; asset_id: string; issuer: string | null; issuer_confirmed: boolean; holders: number | null; raw: TxzVariant }

const tally = <T,>(items: T[], key: (x: T) => string) => items.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}%`);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : NaN);

async function main() {
  const [latest] = await selectRows<{ snapshot_date: string }>("variant_snapshots", "select=snapshot_date&order=snapshot_date.desc&limit=1");
  if (!latest) throw new Error("No snapshot stored.");
  const errors: { scope: string; error: string }[] = [];
  const [rows, measured, universe] = await Promise.all([
    selectRows<Stored>("variant_snapshots", `select=mint,symbol,asset_id,issuer,issuer_confirmed,holders,raw&snapshot_date=eq.${latest.snapshot_date}&order=id`),
    latestMeasurements(),
    getCuratedUniverse(errors),
  ]);

  const scored = rows.map((r) => {
    const base: ScoreContext = { assetId: r.asset_id, canonicalSource: universe.get(r.asset_id)?.asset.canonicalMarket?.source, issuerConfirmed: r.issuer_confirmed, historyDays: 30 };
    const exit = forScore(measured.get(r.mint));
    return { r, facts: measuredFacts(exit), session: exit?.session ?? null, v3: scoreVariant(r.raw, base), v4: scoreVariant(r.raw, { ...base, measuredExit: exit }) };
  });
  const withMeasure = scored.filter((s) => s.facts);

  console.log(`snapshot ${latest.snapshot_date} · ${METHOD_VERSION} · ${rows.length} tokens · ${withMeasure.length} with a usable measurement ` +
    `(${withMeasure.filter((s) => s.session === "open").length} in market hours, ${withMeasure.filter((s) => s.session === "closed").length} out of hours)\n`);

  // 1. Calibration
  const tradable = withMeasure.filter((s) => s.facts!.tradable);
  console.log("1. CALIBRATION — measured tradable tokens:", tradable.length);
  console.log("   capacity (largest size under 1%):", tally(tradable, (s) => `$${s.facts!.capacityUsd.toLocaleString()}`));
  console.log("   median depth score, measured:", median(tradable.map((s) => s.v4.exit.components.liquidity)), "· the same tokens on pool depth:", median(tradable.map((s) => s.v3.exit.components.liquidity)));
  console.log("   median Exit, measured:", median(tradable.map((s) => s.v4.exit.score)), "· on pool depth:", median(tradable.map((s) => s.v3.exit.score)));
  console.log("   filled by:", tally(tradable, (s) => s.facts!.filledBy ?? "unknown"), "\n");

  // 2. Movement
  console.log("2. MOVEMENT — tokens with a usable measurement");
  console.log("   grades v3:", tally(withMeasure, (s) => s.v3.grade), "→ v4:", tally(withMeasure, (s) => s.v4.grade));
  console.log("   tradable v3:", withMeasure.filter((s) => s.v3.routable).length, "→ v4:", withMeasure.filter((s) => s.v4.routable).length);
  const moved = withMeasure.filter((s) => s.v3.grade !== s.v4.grade);
  console.log("   grade changes:", moved.length, tally(moved, (s) => `${s.v3.grade}→${s.v4.grade}`));
  console.log("   by issuer:", tally(moved, (s) => `${s.r.issuer ?? "?"} ${(s.v4.score ?? -1) > (s.v3.score ?? -1) ? "up" : "down"}`));
  const flips = withMeasure.filter((s) => s.v3.routable !== s.v4.routable);
  console.log("   became tradable:", flips.filter((s) => s.v4.routable).map((s) => s.r.symbol).join(" ") || "none");
  console.log("   stopped being tradable:", flips.filter((s) => !s.v4.routable).map((s) => `${s.r.symbol}(${s.v4.notRoutableReason})`).join(" · ") || "none", "\n");

  // 3. Review
  console.log("3. REVIEW — the 40 most widely held measured tokens");
  console.log("   symbol     issuer               holders   pool depth   $5k cost  capacity     filled by      v3        v4");
  for (const s of [...withMeasure].sort((a, b) => (b.r.holders ?? 0) - (a.r.holders ?? 0)).slice(0, 40)) {
    const g = (x: typeof s.v3) => `${x.grade} ${String(x.score ?? "–").padStart(2)} (exit ${String(x.exit.score).padStart(2)})`;
    console.log(`   ${s.r.symbol.padEnd(10)} ${(s.r.issuer ?? "?").slice(0, 20).padEnd(20)} ${String(s.r.holders ?? 0).padStart(7)}   $${String(Math.round(s.r.raw.market.liquidity ?? 0).toLocaleString()).padStart(10)}   ${pct(s.facts!.costPct).padStart(7)}  $${String(s.facts!.capacityUsd.toLocaleString()).padStart(9)}   ${(s.facts!.filledBy ?? "—").padEnd(13)}  ${g(s.v3)}  →  ${g(s.v4)}${s.v3.grade !== s.v4.grade ? "  *" : ""}`);
  }
  if (errors.length) console.log("\nuniverse errors:", errors.slice(0, 5));
}

main().catch((e) => { console.error(e); process.exit(1); });
