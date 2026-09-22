import { Card } from "@/components/trova/shell";
import { Chip } from "@/components/trova/chips";
import { age, percent, usd } from "@/lib/format";
import type { PriceReference } from "@/lib/types";

/** The real-world price every on-chain price on the page is measured against. */
export function ReferenceCard({ reference }: { reference: PriceReference | null }) {
  if (!reference) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <span className="eyebrow">Real-world price</span>
        <span className="text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          No comparable reference. Nothing here is measured against a price with different units — a per-ounce
          token and a per-share ETF aren&apos;t the same thing.
        </span>
      </Card>
    );
  }

  const confPercent = reference.confUsd != null ? (reference.confUsd / reference.priceUsd) * 100 : null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{reference.ticker} reference price</span>
        <Chip tone="neutral">{reference.source === "pyth" ? "Pyth" : "Backpack"}</Chip>
      </div>

      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-display tabular text-[28px] font-bold tracking-tight">{usd(reference.priceUsd)}</span>
        {confPercent != null && <Chip tone="good">±{percent(confPercent, 3)}</Chip>}
        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
          per {reference.basis === "ounce" ? "troy ounce" : "share"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-soft)" }}>
        {reference.ageSec != null && <span>published {age(reference.ageSec)}</span>}
        {reference.marketOpen === false && <Chip tone="warn">US market closed</Chip>}
        {reference.marketOpen === true && <Chip tone="good">Market open</Chip>}
      </div>

      <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Quoted by {reference.source === "pyth" ? "Pyth" : "Backpack"}. Tokens below are measured against it rather than
        against their own last trade — which is how a dead token quoting a stale price gets caught.
      </p>
    </Card>
  );
}
