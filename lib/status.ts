// The state of Trova's own record: which days were measured, how much of the token list each run
// reached, and which method each daily snapshot was written under. Server-only.
//
// Published because the record is what everything else rests on, and a record with silent gaps is
// worth less than one whose gaps are listed.

import { coverage, type CoverageDay } from "./exit-store";
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
}

export async function buildStatus(): Promise<RecordStatus> {
  const [cover, runs] = await Promise.all([
    coverage(30).catch(() => [] as CoverageDay[]),
    selectRows<{ snapshot_date: string; method_version: string; variants: number; errors: unknown[] | null }>(
      "snapshot_runs", "select=snapshot_date,method_version,variants,errors&order=started_at.desc&limit=14",
    ).catch(() => []),
  ]);
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
  };
}
