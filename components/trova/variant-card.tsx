import Link from "next/link";

import { Chip, NoExitBanner, SpeculativeChip } from "@/components/trova/chips";
import { BorderlineNote, GradeBadge } from "@/components/trova/grade-badge";
import { PillarMeter } from "@/components/trova/meter";
import { redemptionLabel, signedPercent, tierLabel, usd } from "@/lib/format";
import type { AssetVariantView } from "@/lib/types";

export function VariantCard({
  assetId,
  variant,
  referenceTicker,
  closeCallWith,
}: {
  assetId: string;
  variant: AssetVariantView;
  referenceTicker?: string | null;
  closeCallWith?: string | null;
}) {
  const s = variant.score;
  const best = variant.isBest;

  return (
    <article
      className="rounded-[14px] p-4 md:p-5"
      style={{
        background: best ? "var(--grade-a-bg)" : "var(--surface)",
        border: best ? "1px solid var(--grade-a)" : "1px solid var(--hairline)",
      }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[15px] font-semibold">{variant.symbol}</span>
            {best && <Chip tone="good">Soundest</Chip>}
            {s.instrument.speculative && <SpeculativeChip />}
            {closeCallWith && <Chip tone="warn">Close call with {closeCallWith}</Chip>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--ink-soft)" }}>
            <span>{variant.issuer}</span>
            {s.issuerConfirmed && (
              <span className="inline-flex items-center gap-1" style={{ color: "var(--grade-a)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                confirmed
              </span>
            )}
            <span>·</span>
            <span>{tierLabel(variant.tier)}</span>
          </div>
        </div>

        <div className="ml-auto flex flex-col items-end gap-1">
          <GradeBadge grade={s.grade} score={s.score} size="lg" />
          <BorderlineNote borderline={s.borderline} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PillarMeter plain="Ownership" term="what you own" value={s.ownership.score} detail={redemptionLabel(variant.stockVariantTier)} />
        <PillarMeter
          plain="Exit"
          term="can you get out"
          value={s.exit.score}
          detail={`${usd(variant.liquidityUsd, { compact: true })} liquidity`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-col">
          <span className="eyebrow">Price</span>
          <span className="font-display tabular text-[15px] font-semibold">{usd(variant.priceUsd)}</span>
        </div>
        {variant.gapPercent != null && referenceTicker && (
          <div className="flex flex-col">
            <span className="eyebrow">vs {referenceTicker}</span>
            <span
              className="font-display tabular text-[15px] font-semibold"
              style={{ color: Math.abs(variant.gapPercent) <= 1 ? "var(--grade-a)" : "var(--grade-c)" }}
            >
              {signedPercent(variant.gapPercent)}
            </span>
          </div>
        )}
        <div className="flex flex-col">
          <span className="eyebrow">Holders</span>
          <span className="font-display tabular text-[15px] font-semibold">
            {variant.holders != null ? variant.holders.toLocaleString("en-US") : "—"}
          </span>
        </div>
        <Link
          href={`/asset/${encodeURIComponent(assetId)}/rating/${variant.mint}`}
          className="ml-auto text-[12px] font-semibold"
          style={{ color: "var(--grade-a)" }}
        >
          Why this rating →
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {!s.routable && s.notRoutableReason && <NoExitBanner reason={s.notRoutableReason} />}
        {s.advisory && (
          <div
            className="rounded-xl px-3.5 py-3 text-[12px] leading-snug"
            style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-line)", color: "var(--danger)" }}
          >
            <b>Advisory · {s.advisory.status}</b>
            {s.advisory.reason ? ` — ${s.advisory.reason}` : ""}
          </div>
        )}
        {variant.explanation && (
          <p className="text-[13px] font-semibold leading-snug">{variant.explanation.headline}</p>
        )}
        {/* Speculative instruments always carry the issuer's own statement (principle 3). */}
        {(s.instrument.speculative || !variant.explanation) && (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            <span className="font-semibold" style={{ color: "var(--ink)" }}>
              {s.instrument.label}.
            </span>{" "}
            {s.instrument.summary}
          </p>
        )}
        {variant.redemptionNote && (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
            {variant.redemptionNote}
          </p>
        )}
      </div>
    </article>
  );
}
