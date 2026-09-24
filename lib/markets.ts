// Markets — discovery. Trending, the curated lists, and search.
//
// Every row carries the Trova grade, and it costs nothing extra: the nightly snapshot already
// scored all ~560 variants, so the grade is a single indexed lookup against the latest snapshot
// date rather than a fan-out of getVariants calls. Discovery that cannot show a rating is just a
// price list, and a price list is the thing we are arguing against.
//
// Rows whose mint was never snapshotted come back with grade null — unrated, and labelled as such.
// A missing grade must never render as a bad one.

import { selectRows } from "./supabase-rest";
import { getCurated, getTrending, searchAssets, type CuratedList } from "./tokens-xyz";
import type { MarketRow, MarketsOverview, Rating } from "./types";

/** tokens.xyz shapes, only the fields we surface. */
interface TxzRow {
  assetId?: string;
  mint?: string;
  symbol?: string;
  name?: string;
  category?: string;
  imageUrl?: string;
  advisory?: unknown;
  rank?: number;
  market?: { price?: number; liquidity?: number; volume24hUSD?: number; priceChange24hPercent?: number };
  stats?: { price?: number; liquidity?: number; volume24hUSD?: number; priceChange24hPercent?: number };
}

export interface GradeRow {
  mint: string;
  asset_id: string;
  symbol: string;
  score: number | null;
  grade: string;
  speculative: boolean;
  routable: boolean;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// PostgREST takes the filter in the URL, so a 400-mint IN list would build a ~20KB request.
const CHUNK = 120;

/**
 * Best snapshot grade per ASSET, keyed by assetId.
 *
 * Keyed on the asset, not the mint, because the curated and search endpoints do not return a mint
 * at all — measured 2026-09-24, 0 of 401 curated stocks carry one, and only `trending` does. It is
 * also the right answer: a markets row says "NVIDIA", so the grade it deserves is the best variant
 * a buyer could actually hold, which is what the asset page would send them to.
 */
async function gradesFor(assetIds: string[]): Promise<Map<string, GradeRow>> {
  const out = new Map<string, GradeRow>();
  const unique = [...new Set(assetIds)].filter(Boolean);
  if (unique.length === 0) return out;

  // The newest date present, so a late or skipped cron run reads yesterday rather than nothing.
  const latest = await selectRows<{ snapshot_date: string }>(
    "variant_snapshots", "select=snapshot_date&order=snapshot_date.desc&limit=1");
  const date = latest[0]?.snapshot_date;
  if (!date) return out;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK).map((id) => `"${id}"`);
    let rows: GradeRow[];
    try {
      rows = await selectRows<GradeRow>(
        "variant_snapshots",
        `select=mint,asset_id,symbol,score,grade,speculative,routable&snapshot_date=eq.${date}&asset_id=in.(${batch.join(",")})`,
      );
    } catch {
      continue;   // a failed batch costs those rows a grade, not the whole page
    }
    for (const r of rows) {
      const held = out.get(r.asset_id);
      if (!held || better(r, held)) out.set(r.asset_id, r);
    }
  }
  return out;
}

/** The variant a buyer would actually be sent to: routable first, then the higher score. */
export function better(a: GradeRow, b: GradeRow): boolean {
  if (a.routable !== b.routable) return a.routable;
  return (a.score ?? -1) > (b.score ?? -1);
}

function toRow(r: TxzRow, grades: Map<string, GradeRow>): MarketRow {
  const m = r.market ?? r.stats ?? {};
  const g = r.assetId ? grades.get(r.assetId) : undefined;
  return {
    assetId: r.assetId ?? "",
    mint: r.mint ?? g?.mint ?? null,
    symbol: r.symbol ?? "",
    name: r.name ?? r.symbol ?? "",
    category: r.category ?? null,
    logoUrl: r.imageUrl ?? null,
    priceUsd: num(m.price),
    liquidityUsd: num(m.liquidity),
    volume24hUsd: num(m.volume24hUSD),
    priceChange24hPercent: num(m.priceChange24hPercent),
    // Absent from the snapshot means unrated, which is a fact — not a poor grade.
    score: g?.score ?? null,
    grade: (g?.grade as Rating) ?? null,
    speculative: g?.speculative ?? false,
    routable: g?.routable ?? null,
    hasAdvisory: r.advisory != null,
  };
}

async function decorate(rows: TxzRow[]): Promise<MarketRow[]> {
  const grades = await gradesFor(rows.map((r) => r.assetId ?? "").filter(Boolean));
  return rows.filter((r) => r.assetId).map((r) => toRow(r, grades));
}

/** Rows for one curated list, graded. */
export async function getMarketList(list: CuratedList): Promise<MarketRow[]> {
  const res = await getCurated(list);
  return decorate((res.assets ?? []) as TxzRow[]);
}

/** Search, graded. Fuzzy on the tokens.xyz side — "nvid" finds NVIDIA. */
export async function searchMarket(query: string, limit = 20): Promise<MarketRow[]> {
  const q = query.trim();
  if (!q) return [];
  const res = (await searchAssets(q)) as { results?: TxzRow[] };
  return (await decorate(res.results ?? [])).slice(0, limit);
}

/**
 * The markets screen: what is moving, and the curated lists behind the tabs. Each section degrades
 * on its own — one list failing must never empty the page.
 */
export async function getMarketsOverview(lists: CuratedList[] = ["stocks", "etfs", "metals"]): Promise<MarketsOverview> {
  const warnings: string[] = [];
  const soft = async <T>(label: string, p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch (e) {
      warnings.push(`${label} unavailable: ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  };

  const [trendingRaw, listResults] = await Promise.all([
    soft("Trending", getTrending() as Promise<{ trending?: TxzRow[] }>, { trending: [] }),
    Promise.all(lists.map((l) => soft(`Curated ${l}`, getCurated(l), { assets: [] as unknown[] }))),
  ]);

  const trendingRows = (trendingRaw.trending ?? []) as TxzRow[];
  const byList = lists.map((l, i) => ({ list: l, rows: ((listResults[i]?.assets ?? []) as TxzRow[]) }));

  // One grade lookup covers every section on the page.
  const grades = await gradesFor([
    ...trendingRows.map((r) => r.assetId ?? ""),
    ...byList.flatMap((b) => b.rows.map((r) => r.assetId ?? "")),
  ].filter(Boolean));

  return {
    asOf: Date.now(),
    trending: trendingRows.filter((r) => r.assetId).map((r) => toRow(r, grades)),
    lists: byList.map(({ list, rows }) => ({
      list,
      rows: rows.filter((r) => r.assetId).map((r) => toRow(r, grades)),
    })),
    warnings,
  };
}
