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
import { getAsset, getCurated, getTrending, searchAssets, type CuratedList } from "./tokens-xyz";
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
async function gradesFor(assetIds: string[]): Promise<Map<string, GradeRow & { mints?: string[] }>> {
  const out = new Map<string, GradeRow & { mints?: string[] }>();
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
      const mints = [...(held?.mints ?? []), r.mint];
      out.set(r.asset_id, { ...(!held || better(r, held) ? r : held), mints });
    }
  }
  return out;
}

/** The variant a buyer would actually be sent to: routable first, then the higher score. */
export function better(a: GradeRow, b: GradeRow): boolean {
  if (a.routable !== b.routable) return a.routable;
  return (a.score ?? -1) > (b.score ?? -1);
}

const cleanName = (name: string | undefined) => (name ?? "").replace(/\s+-\s+xStock$/i, "").trim();

function toRow(r: TxzRow, grades: Map<string, GradeRow & { mints?: string[] }>): MarketRow {
  const m = r.market ?? r.stats ?? {};
  const g = r.assetId ? grades.get(r.assetId) : undefined;
  return {
    assetId: r.assetId ?? "",
    mint: r.mint ?? g?.mint ?? null,
    // tokens.xyz's trending feed gives some xStocks the generic symbol "xStock" and a name like
    // "GameStop - xStock". Our own snapshot knows the real ticker (GMEx); the name loses the suffix.
    symbol: /^xstock$/i.test(r.symbol ?? "") ? g?.symbol ?? cleanName(r.name) : r.symbol ?? "",
    name: cleanName(r.name ?? r.symbol ?? ""),
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
    // Every mint we snapshot for this asset, so a watchlist can ask /api/signals what changed.
    mints: g?.mints ?? (r.mint ? [r.mint] : []),
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

  const privateCompanies = await soft("Private companies", privateCompanyRows(), [] as MarketRow[]);

  return {
    asOf: Date.now(),
    privateCompanies,
    trending: trendingRows.filter((r) => r.assetId).map((r) => toRow(r, grades)),
    lists: byList.map(({ list, rows }) => ({
      list,
      rows: rows.filter((r) => r.assetId).map((r) => toRow(r, grades)),
    })),
    warnings,
  };
}

/**
 * Rows for a specific set of assets, in the order given — what the watchlist renders. Built from the
 * curated lists (cached, and they already carry price and logo), falling back to a per-asset lookup
 * for anything outside them. An asset tokens.xyz no longer knows is dropped, not shown blank.
 */
export async function getAssetRows(assetIds: string[]): Promise<MarketRow[]> {
  const wanted = [...new Set(assetIds)].filter(Boolean);
  if (wanted.length === 0) return [];

  const lists = await Promise.all(
    (["stocks", "etfs", "metals", "rwas"] as CuratedList[]).map((l) => getCurated(l).catch(() => ({ assets: [] as unknown[] }))),
  );
  const index = new Map<string, TxzRow>();
  for (const l of lists) for (const a of (l.assets ?? []) as TxzRow[]) if (a.assetId) index.set(a.assetId, a);

  const missing = wanted.filter((id) => !index.has(id));
  await Promise.all(missing.map(async (id) => {
    try {
      const a = (await getAsset(id)) as TxzRow | null;
      if (a?.assetId) index.set(id, a);
    } catch {
      // unknown to tokens.xyz now — dropped below
    }
  }));

  const grades = await gradesFor(wanted);
  return wanted.filter((id) => index.has(id)).map((id) => toRow(index.get(id)!, grades));
}

/**
 * Companies you can only reach through pre-IPO exposure: every token we track for them is SPV
 * exposure. An asset with even one listed token is not here. SpaceX, whose leftover pre-IPO wrappers
 * sit beside a cash-redeemable tracker, is a listed company with speculative siblings, not a
 * private one.
 */
async function privateCompanyRows(): Promise<MarketRow[]> {
  const latest = await selectRows<{ snapshot_date: string }>(
    "variant_snapshots", "select=snapshot_date&order=snapshot_date.desc&limit=1");
  const date = latest[0]?.snapshot_date;
  if (!date) return [];
  const rows = await selectRows<{ asset_id: string; speculative: boolean }>(
    "variant_snapshots", `select=asset_id,speculative&snapshot_date=eq.${date}`);
  const allSpeculative = new Map<string, boolean>();
  for (const r of rows) allSpeculative.set(r.asset_id, (allSpeculative.get(r.asset_id) ?? true) && r.speculative);
  const ids = [...allSpeculative].filter(([, all]) => all).map(([id]) => id);
  return getAssetRows(ids);
}
