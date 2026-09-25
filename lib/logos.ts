// Company logos. Server-only.
//
// tokens.xyz serves two kinds of image. Its COMPANY logos (api.tokens.xyz/logos/{xstocks|prestocks|
// commodities}/…) are clean marks. Its TOKEN icons (storage.googleapis.com/tokens-asset-logos-prd/…)
// overlay the issuer's pattern on the company mark, and cropped to a circle they look muddy — the
// trending feed only carries those. So a logo is chosen per COMPANY, from the curated lists, and
// only ever a company logo. Where none exists the UI draws the canvas's brand disc instead.

import { getCurated, type CuratedList } from "./tokens-xyz";

const CLEAN = /^https:\/\/api\.tokens\.xyz\/logos\//;
const TTL_MS = 30 * 60_000;

let cache: { at: number; map: Map<string, string> } | null = null;

export const isCleanLogo = (url: string | null | undefined): url is string => !!url && CLEAN.test(url);

/** assetId → clean company logo, from every curated list. Never throws; an outage means no logos. */
export async function getCompanyLogos(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = new Map<string, string>();
  const lists: CuratedList[] = ["stocks", "etfs", "metals", "rwas"];
  const results = await Promise.all(lists.map((l) => getCurated(l).catch(() => ({ assets: [] as unknown[] }))));
  for (const r of results) {
    for (const a of (r.assets ?? []) as { assetId?: string; imageUrl?: string }[]) {
      if (a.assetId && isCleanLogo(a.imageUrl)) map.set(a.assetId, a.imageUrl);
    }
  }
  cache = { at: Date.now(), map };
  return map;
}

export async function logoFor(assetId: string): Promise<string | null> {
  return (await getCompanyLogos()).get(assetId) ?? null;
}
