// Runs the scoring engine and explain() over every real token in the latest snapshot and reports
// crashes, NaN/undefined in copy, empty headlines, and any drift from the stored score.
// Run: npx tsx --env-file=.env.local scripts/sweep-explanations.ts

import { selectRows } from "../lib/supabase-rest";
import { scoreVariant } from "../lib/trust-score";
import { explain } from "../lib/explain";
import type { TxzVariant } from "../lib/types";
(async () => {
  const runs = await selectRows<any>("snapshot_runs", "select=snapshot_date,started_at,variants,errors&order=started_at.desc&limit=2");
  console.log("latest cron runs:", runs.map(r => `${r.snapshot_date} @${r.started_at.slice(11,16)}Z ${r.variants}v errs=${(r.errors||[]).length}`).join(" | "));
  const date = runs[0].snapshot_date;
  const rows = await selectRows<{ symbol: string; asset_id: string; raw: TxzVariant; score: number | null }>(
    "variant_snapshots", `select=symbol,asset_id,raw,score&snapshot_date=eq.${date}`);
  const bad: string[] = []; const headlines = new Map<string, number>(); let drift = 0;
  for (const r of rows) {
    try {
      const ctx = { assetId: r.asset_id };
      const s = scoreVariant(r.raw, ctx);
      const e = explain(r.raw, s, ctx);
      const text = JSON.stringify(e);
      if (/NaN|undefined|Infinity|\$-|null of/.test(text)) bad.push(`${r.symbol}: suspicious text ${text.match(/.{30}(NaN|undefined|Infinity|\$-|null of).{20}/)?.[0]}`);
      if (!e.headline || e.headline.length < 12) bad.push(`${r.symbol}: empty headline`);
      for (const sc of e.scenarios) if (sc.after.score != null && !Number.isFinite(sc.after.score)) bad.push(`${r.symbol}: scenario NaN`);
      const shape = e.headline.replace(/\$[\d.,]+[kMB]?/g, "$X").replace(/\d+/g, "N");
      headlines.set(shape, (headlines.get(shape) ?? 0) + 1);
      if (r.score !== s.score) drift++;
    } catch (err: any) { bad.push(`${r.symbol}: THREW ${err.message}`); }
  }
  console.log(`swept ${rows.length} real tokens | problems: ${bad.length} | score differs from stored snapshot: ${drift}`);
  bad.slice(0, 12).forEach(b => console.log("  ✗", b));
  console.log(`distinct headline shapes: ${headlines.size}`);
  [...headlines].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([h, n]) => console.log(`  ${String(n).padStart(4)}  ${h}`));
})();
