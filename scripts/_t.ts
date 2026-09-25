import { buildAssetDetail } from "../lib/asset";
import { choosePrice } from "../lib/price";
(async () => {
  for (const id of ["openai", "tesla", "cleanspark", "anthropic"]) {
    const d = (await buildAssetDetail(id))!;
    const c = d.variants.find((v) => v.mint === d.priceHistory?.mint);
    const pm = d.privateMark;
    console.log(`${id.padEnd(10)} ${c?.symbol.padEnd(9)} price $${c?.priceUsd?.toFixed(2)} basis=${c?.priceBasis ?? "listed"}${c?.listedPriceUsd ? ` (listed $${c.listedPriceUsd.toFixed(2)})` : ""}` +
      (pm ? ` | mark $${(pm.markValuationUsd / 1e12).toFixed(2)}T, implied $${((pm.impliedValuationUsd ?? 0) / 1e12).toFixed(2)}T` + (pm.atTradedPrice ? ` → at traded price $${(pm.atTradedPrice.impliedValuationUsd / 1e12).toFixed(2)}T (+${pm.atTradedPrice.premiumToMarkPercent.toFixed(0)}% over mark)` : "") : ""));
  }
})();
