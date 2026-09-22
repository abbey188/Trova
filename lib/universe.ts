// The curated universe Trova covers: tokens.xyz curated stocks, ETFs, metals and RWAs.

import { getCurated, type CuratedList } from "./tokens-xyz";
import type { Asset, TxzAsset } from "./types";

export const CURATED_LISTS: { list: CuratedList; assetClass: Asset["assetClass"] }[] = [
  { list: "stocks", assetClass: "stock" },
  { list: "etfs", assetClass: "etf" },
  { list: "metals", assetClass: "metal" },
  { list: "rwas", assetClass: "rwa" },
];

export interface UniverseEntry {
  asset: TxzAsset;
  assetClass: Asset["assetClass"];
}

/** Curated assets keyed by assetId; an asset in several lists keeps the first list's class.
 *  A failed list is recorded in `errors` (when given) instead of failing the whole universe. */
export async function getCuratedUniverse(errors?: { scope: string; error: string }[]): Promise<Map<string, UniverseEntry>> {
  const universe = new Map<string, UniverseEntry>();
  for (const { list, assetClass } of CURATED_LISTS) {
    try {
      const { assets } = await getCurated(list);
      for (const asset of assets as TxzAsset[]) {
        if (!universe.has(asset.assetId)) universe.set(asset.assetId, { asset, assetClass });
      }
    } catch (e) {
      if (!errors) throw e;
      errors.push({ scope: `curated:${list}`, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return universe;
}
