// The collateral sheet, cached for pages. Kept apart from lib/collateral.ts so scripts can import the
// builder without pulling in Next's cache.

import { unstable_cache } from "next/cache";

import { buildCollateralFile, buildCollateralSheet } from "./collateral";

/** The whole sheet, rebuilt at most every ten minutes. A thrown error is not cached. */
export const cachedSheet = unstable_cache(async () => buildCollateralSheet(), ["collateral-sheet-v2"], { revalidate: 600 });

/** One token's file, rebuilt at most every five minutes. */
export const cachedFile = unstable_cache(async (mint: string) => buildCollateralFile(mint), ["collateral-file-v1"], { revalidate: 300 });
