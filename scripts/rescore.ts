// Re-score a stored snapshot date under the current METHOD_VERSION (raw inputs, no re-fetch).
// Run: pnpm rescore [YYYY-MM-DD]   (defaults to today, UTC)

import { rescoreSnapshots } from "../lib/snapshot";

async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Expected a date like 2026-09-15, got "${date}"`);
  const r = await rescoreSnapshots(date);
  console.log(`rescored ${r.rescored} rows for ${r.date} under ${r.methodVersion} · ${r.changes.length} grade/score changes · ${r.errors.length} errors`);
  for (const c of r.changes) console.log(`  ${c.symbol}: ${c.from} → ${c.to}`);
  if (r.errors.length) console.log("errors:", r.errors);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
