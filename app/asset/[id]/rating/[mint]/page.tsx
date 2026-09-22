import Link from "next/link";
import { notFound } from "next/navigation";

import { Chip } from "@/components/trova/chips";
import { BorderlineNote, GradeBadge } from "@/components/trova/grade-badge";
import { Meter } from "@/components/trova/meter";
import { Card, Shell } from "@/components/trova/shell";
import { buildAssetDetail } from "@/lib/asset";
import { count, percent, redemptionLabel, usd } from "@/lib/format";
import { GRADE_CUTOFFS } from "@/lib/trust-score";

export const revalidate = 30;

export default async function RatingPage({ params }: { params: Promise<{ id: string; mint: string }> }) {
  const { id, mint } = await params;
  const assetId = decodeURIComponent(id);
  const detail = await buildAssetDetail(assetId);
  const variant = detail?.variants.find((v) => v.mint === mint);
  if (!detail || !variant) notFound();

  const s = variant.score;
  const ownership = s.ownership.components;
  const exit = s.exit.components;
  const combined = Math.round(Math.sqrt(Math.max(s.ownership.score, 1) * Math.max(s.exit.score, 1)));

  return (
    <Shell
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span>Why {variant.symbol} is rated</span>
          <GradeBadge grade={s.grade} score={s.score} size="lg" />
          <BorderlineNote borderline={s.borderline} />
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {detail.asset.name} · {variant.issuer}
          </span>
        </span>
      }
      actions={
        <Link
          href={`/asset/${encodeURIComponent(assetId)}`}
          className="rounded-[10px] px-4 py-2.5 text-[13px] font-semibold"
          style={{ border: "1px solid var(--hairline)", color: "var(--ink)" }}
        >
          Back to {detail.asset.symbol}
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-4 p-5">
            <header className="flex items-baseline gap-2.5">
              <h2 className="font-display text-[15px] font-semibold">Ownership</h2>
              <span className="eyebrow">what you own</span>
              <span className="font-display tabular ml-auto text-[26px] font-bold">{s.ownership.score}</span>
            </header>

            <Component
              label="Can you swap it for the real share?"
              term="Redemption right"
              weight="70% of this pillar"
              value={ownership.redemption}
              note={
                ownership.redemptionReported
                  ? `The issuer documents it: ${redemptionLabel(variant.stockVariantTier).toLowerCase()}. Swapping for the real share scores 100, cash value 75, no redemption 30.`
                  : (variant.redemptionNote ?? "Not reported by the issuer.")
              }
            />

            <Component
              label="What the token gives you"
              term="Product rights"
              weight="30% of this pillar"
              value={ownership.product}
              note={
                ownership.product === 0
                  ? "Exposure through an SPV: no ownership, voting, dividend or information rights."
                  : ownership.product === 40
                    ? "Borrowed exposure that resets daily — it drifts from the underlying over time."
                    : "Full economic exposure to one share."
              }
            />

            <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold">Warnings against this token</span>
                <span className="font-display ml-auto text-[13px] font-semibold" style={{ color: s.advisory ? "var(--danger)" : "var(--grade-a)" }}>
                  {s.advisory ? s.advisory.status : "None"}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                {s.advisory?.reason ?? "No warning from our sources. A warning is the only thing that caps a rating outright."}
              </p>
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <header className="flex items-baseline gap-2.5">
              <h2 className="font-display text-[15px] font-semibold">Exit</h2>
              <span className="eyebrow">can you sell it</span>
              <span className="font-display tabular ml-auto text-[26px] font-bold">{s.exit.score}</span>
            </header>

            <Component label="Depth of the market" term="Liquidity" value={exit.liquidity} note={`${usd(variant.liquidityUsd, { compact: true })} on-chain`} />
            <Component label="How much it actually trades" term="Activity" value={exit.activity} note={`${usd(variant.volume24hUsd, { compact: true })} in 24h`} />
            <Component label="How many people hold it" term="Holders" value={exit.holders} note={`${count(variant.holders)} wallets`} />
            {exit.execution != null ? (
              <Component label="Quality of the fills" term="Execution" value={exit.execution} note="fills, fees and how much flow is bots" />
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold">Quality of the fills</span>
                <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  Not reported for this token, so the other three carry this pillar.
                </span>
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
            <span className="font-display text-[17px] font-semibold tabular">
              √({s.ownership.score} × {s.exit.score}) = {combined}
            </span>
            <p className="min-w-[240px] flex-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              The two halves are multiplied, not averaged, so neither can hide the other: perfect paperwork with a
              dead market still fails, and a busy market with no rights fails too.
            </p>
            {s.score != null && (
              <Chip tone={s.grade === "A" || s.grade === "B" ? "good" : s.grade === "C" ? "warn" : "danger"}>
                {s.grade} · cutoff {s.grade === "A" ? GRADE_CUTOFFS.A : s.grade === "B" ? GRADE_CUTOFFS.B : GRADE_CUTOFFS.C}
              </Chip>
            )}
          </Card>

          <Card className="flex flex-col gap-2 p-5">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">How much we know</span>
              <span className="eyebrow">Confidence</span>
              <span className="font-display ml-auto text-[13px] font-semibold capitalize">{s.confidence}</span>
            </div>
            <Meter
              value={s.confidence === "high" ? 100 : s.confidence === "medium" ? 60 : 30}
              tone={s.confidence === "high" ? "var(--grade-a)" : s.confidence === "medium" ? "var(--grade-c)" : "var(--grade-d)"}
            />
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Based on how much the issuer and the market actually report. Missing information lowers confidence —
              it never silently improves a rating.
            </p>
          </Card>
        </div>

        <Card className="flex flex-col gap-2 p-5">
          <span className="eyebrow">What would move this rating</span>
          <ul className="flex flex-col gap-1.5 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            <li>
              • A change in what you can redeem it for moves <b style={{ color: "var(--ink)" }}>Ownership</b> the same day
              it&apos;s reported.
            </li>
            <li>
              • Liquidity or trading falling away moves <b style={{ color: "var(--ink)" }}>Exit</b> — and if it stops
              trading entirely, the token stops being tradable here at all.
            </li>
            <li>• A warning from our sources caps the rating outright, whatever the market is doing.</li>
            <li>• Ratings update as information becomes public; this one is stamped {s.methodVersion}.</li>
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

function Component({
  label,
  term,
  value,
  note,
  weight,
}: {
  label: string;
  term: string;
  value: number;
  note: string;
  weight?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="eyebrow">{term}</span>
        <span className="font-display tabular ml-auto text-[13px] font-semibold">{value}</span>
      </div>
      <Meter value={value} />
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {note}
        </span>
        {weight && (
          <span className="ml-auto text-[11px]" style={{ color: "var(--ink-faint)" }}>
            {weight}
          </span>
        )}
      </div>
    </div>
  );
}
