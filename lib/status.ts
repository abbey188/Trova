// The state of Trova's own record: which days were measured, how much of the token list each run
// reached, and which method each daily snapshot was written under. Server-only.
//
// Published because the record is what everything else rests on, and a record with silent gaps is
// worth less than one whose gaps are listed.

import { coverage, lastMeasured, MEASUREMENT_MAX_AGE_DAYS, type CoverageDay } from "./exit-store";
import { selectRows } from "./supabase-rest";
import { METHOD_VERSION } from "./trust-score";

export interface RecordStatus {
  asOf: string;
  methodVersion: string;
  /** Tokens in the latest daily snapshot — what a full measurement would cover. */
  tokens: number | null;
  measuredSince: string;
  days: { date: string; open: CoverageDay | null; closed: CoverageDay | null }[];
  snapshots: { date: string; methodVersion: string; tokens: number; errors: number }[];
  /** How old each token's latest in-hours measurement is. Past MEASUREMENT_MAX_AGE_DAYS a token is
   *  scored on pool depth again, which misjudges every token a market maker fills: on 21 Oct 2026
   *  350 tokens were past the old 4-day limit before anyone noticed. */
  freshness: { underOneDay: number; oneToSeven: number; sevenToLimit: number; pastLimit: number; limitDays: number; pastLimitSample: string[] };
}

export async function buildStatus(): Promise<RecordStatus> {
  const [cover, runs, lastOpen, tokenRows] = await Promise.all([
    coverage(30).catch(() => [] as CoverageDay[]),
    selectRows<{ snapshot_date: string; method_version: string; variants: number; errors: unknown[] | null }>(
      "snapshot_runs", "select=snapshot_date,method_version,variants,errors&order=started_at.desc&limit=14",
    ).catch(() => []),
    lastMeasured("open", MEASUREMENT_MAX_AGE_DAYS + 7).catch(() => new Map<string, string>()),
    selectRows<{ mint: string; symbol: string }>("variant_snapshots", "select=mint,symbol,snapshot_date&order=snapshot_date.desc&limit=1")
      .then(async ([latest]) => (latest ? selectRows<{ mint: string; symbol: string }>("variant_snapshots", `select=mint,symbol&snapshot_date=eq.${(latest as unknown as { snapshot_date: string }).snapshot_date}&order=id`) : []))
      .catch(() => [] as { mint: string; symbol: string }[]),
  ]);
  const now = Date.now();
  const ageDays = (mint: string) => { const t = lastOpen.get(mint); return t ? (now - Date.parse(t)) / 86_400_000 : Infinity; };
  const ages = tokenRows.map((r) => ({ symbol: r.symbol, age: ageDays(r.mint) }));
  const freshness = {
    underOneDay: ages.filter((a) => a.age < 1).length,
    oneToSeven: ages.filter((a) => a.age >= 1 && a.age < 7).length,
    sevenToLimit: ages.filter((a) => a.age >= 7 && a.age < MEASUREMENT_MAX_AGE_DAYS).length,
    pastLimit: ages.filter((a) => a.age >= MEASUREMENT_MAX_AGE_DAYS).length,
    limitDays: MEASUREMENT_MAX_AGE_DAYS,
    pastLimitSample: ages.filter((a) => a.age >= MEASUREMENT_MAX_AGE_DAYS).slice(0, 12).map((a) => a.symbol),
  };
  const byDate = new Map<string, { date: string; open: CoverageDay | null; closed: CoverageDay | null }>();
  for (const c of cover) {
    const d = byDate.get(c.date) ?? byDate.set(c.date, { date: c.date, open: null, closed: null }).get(c.date)!;
    d[c.session] = c;
  }
  return {
    asOf: new Date().toISOString(),
    methodVersion: METHOD_VERSION,
    tokens: runs[0]?.variants ?? null,
    measuredSince: "2026-10-12",
    days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)),
    snapshots: runs.map((r) => ({ date: r.snapshot_date, methodVersion: r.method_version, tokens: r.variants, errors: r.errors?.length ?? 0 })),
    freshness,
  };
}
