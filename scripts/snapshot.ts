// Daily snapshot job (local). Run: pnpm snapshot   |   pnpm snapshot:dry  (collects + scores, writes nothing)
// In production the same runSnapshot() runs from the Vercel Cron route /api/cron/snapshot.

import { runSnapshot } from "../lib/snapshot";

async function main() {
  const s = await runSnapshot({ dryRun: process.argv.includes("--dry-run") });
  console.log(`snapshot ${s.date} · ${s.methodVersion} · ${s.assets} assets · ${s.variants} variants · ` +
    `${s.dryRun ? "DRY RUN (nothing written)" : `${s.written} written`} · ${s.errors.length} errors · ${s.seconds}s`);
  console.log("grades:", s.grades);
  console.log("routable grades:", s.routableGrades);
  console.log("instrument classes:", s.instrumentClasses);
  console.log("borderline:", s.borderline, "· speculative:", s.speculative);
  if (s.errors.length) console.log("errors:", s.errors.slice(0, 10));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
