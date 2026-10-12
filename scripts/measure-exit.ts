// Exit measurement job (local). Run: pnpm measure   |   pnpm measure --dry-run   |   pnpm measure --limit=20
// Quotes a ladder of round trips for every tracked token and stores it. Resumable: tokens already
// measured today in this market session are skipped, so an interrupted run is simply run again.
// In production the same runMeasurement() runs in slices from /api/cron/exit.

import { runMeasurement } from "../lib/exit-measure";

const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const s = await runMeasurement({
    dryRun,
    limit,
    onToken: (t, rungs) => {
      const line = rungs.length
        ? rungs.map((r) => `$${r.usdSize.toLocaleString()} ${r.status === "ok" ? `${pct(r.roundTripPct)}${r.liquidity === "market-maker" ? " mm" : ""}` : r.status}`).join(" · ")
        : "Jupiter unavailable — left for the next run";
      console.log(`${t.symbol.padEnd(10)} ${line}`);
    },
  });
  console.log(`\nexit measurement ${s.date} · session ${s.session} · ${s.measured} measured · ${s.alreadyDone} already done · ` +
    `${s.remaining} remaining · ${dryRun ? "DRY RUN (nothing written)" : `${s.rowsWritten} rows written`} · ${s.seconds}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
