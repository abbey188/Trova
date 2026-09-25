import Link from "next/link";
import { notFound } from "next/navigation";

import { RatingHistory } from "@/components/trova/charts";
import { GradeBadge } from "@/components/trova/grade-badge";
import { AssetLogo } from "@/components/trova/search";
import { Card, Shell } from "@/components/trova/shell";
import { buildAssetDetail } from "@/lib/asset";
import type { Driver } from "@/lib/explain";
import { GRADE_CUTOFFS } from "@/lib/trust-score";

export const revalidate = 120;

const barTone = (v: number) => (v >= 65 ? "var(--grade-a)" : v >= 50 ? "var(--grade-c)" : "var(--danger)");

function DriverRow({ d }: { d: Driver }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold">{d.label}</span>
        <span className="tabular ml-auto text-[13px] font-bold">{d.score ?? "—"}</span>
      </div>
      {d.score != null && (
        <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
          <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: barTone(d.score) }} />
        </div>
      )}
      <div className="flex items-baseline gap-3">
        <span className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>{d.fact}</span>
        {d.weight && <span className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--ink-faint)" }}>{d.weight}</span>}
      </div>
    </div>
  );
}

export default async function RatingPage({ params }: { params: Promise<{ id: string; mint: string }> }) {
  const { id, mint } = await params;
  const assetId = decodeURIComponent(id);
  const detail = await buildAssetDetail(assetId);
  const variant = detail?.variants.find((v) => v.mint === mint);
  if (!detail || !variant || !variant.explanation) notFound();

  const s = variant.score;
  const e = variant.explanation;
  const ownership = e.drivers.filter((d) => d.pillar === "ownership");
  const exit = e.drivers.filter((d) => d.pillar === "exit");
  const cap = e.drivers.find((d) => d.pillar === "cap");
  const reported = e.inputs.filter((i) => i.reported).length;
  const missing = e.inputs.filter((i) => !i.reported).map((i) => i.label.toLowerCase());
  const cutoff = s.grade === "A" ? GRADE_CUTOFFS.A : s.grade === "B" ? GRADE_CUTOFFS.B : s.grade === "C" ? GRADE_CUTOFFS.C : null;
  const points = variant.history?.points.map((p) => ({ date: p.date, ownership: p.ownership, exit: p.exit })) ?? [];

  return (
    <Shell
      active="markets"
      back={{ href: `/asset/${encodeURIComponent(assetId)}`, label: detail.asset.name }}
      title={
        <span className="flex items-center gap-3">
          <AssetLogo src={variant.logoURI} name={detail.asset.name} size={32} />
          <span>Why {variant.symbol} is rated</span>
          <GradeBadge grade={s.grade} score={s.score} size="lg" />
        </span>
      }
      subtitle={`${detail.asset.name} · ${variant.issuer}${s.borderline ? ` · close to ${s.borderline.adjacentGrade}` : ""}`}
    >
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2 p-5">
          <p className="font-display text-[20px] font-semibold leading-snug">{e.headline}</p>
          {e.holdingBack && e.holdingBack.pillar !== "cap" && (
            <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
              What holds it back most: <b style={{ color: "var(--ink)" }}>{e.holdingBack.label.toLowerCase()}</b>.
            </span>
          )}
          {s.instrument.speculative && (
            <p className="mt-2 rounded-[12px] p-3 text-[12px] leading-relaxed" style={{ background: "var(--grade-c-bg)" }}>
              <b style={{ color: "var(--grade-c)" }}>Speculative. </b>{s.instrument.summary}
            </p>
          )}
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-[16px] font-bold">Ownership</h2>
              <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>what you&apos;d own</span>
              <span className="font-display tabular ml-auto text-[28px] font-bold">{s.ownership.score}</span>
            </div>
            {ownership.map((d) => <DriverRow key={d.key} d={d} />)}
            <div className="flex items-start gap-2 pt-3 text-[13px]" style={{ borderTop: "1px solid var(--hairline)" }}>
              <span className="font-semibold">Warnings against this token</span>
              <span className="ml-auto font-bold" style={{ color: cap ? "var(--danger)" : "var(--grade-a)" }}>{cap ? s.advisory?.status : "None"}</span>
            </div>
            {cap && <span className="text-[12px]" style={{ color: "var(--danger)" }}>{cap.fact}</span>}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-[16px] font-bold">Exit</h2>
              <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>can you get back out</span>
              <span className="font-display tabular ml-auto text-[28px] font-bold">{s.exit.score}</span>
            </div>
            {exit.map((d) => <DriverRow key={d.key} d={d} />)}
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
            <span className="font-display tabular text-[20px] font-bold">√({s.ownership.score} × {s.exit.score}) = {s.score ?? "NR"}</span>
            <p className="min-w-[220px] flex-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Multiplied, not averaged. A busy market can&apos;t buy an A for a token you don&apos;t own anything through — and neither can perfect paperwork nobody will trade.
            </p>
            {cutoff != null && (
              <span className="rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ color: barTone(s.score ?? 0), background: "var(--canvas)" }}>{s.grade} · cutoff {cutoff}</span>
            )}
          </Card>
          <Card className="flex flex-col gap-2 p-5">
            <div className="flex items-center text-[13px]">
              <span className="font-semibold">How much we know</span>
              <span className="ml-auto font-bold capitalize">{s.confidence}</span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
              <div className="h-full rounded-full" style={{ width: `${(reported / e.inputs.length) * 100}%`, background: barTone((reported / e.inputs.length) * 100) }} />
            </div>
            <span className="text-[11px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
              {reported} of {e.inputs.length} inputs reported{missing.length ? ` — missing: ${missing.join(", ")}` : ""}. Missing information lowers confidence; it never quietly improves a rating.
            </span>
          </Card>
        </div>

        <Card className="flex flex-col gap-3 p-5">
          <span className="text-[13px] font-semibold">Rating over {points.length} days</span>
          <RatingHistory points={points} />
        </Card>

        {e.scenarios.length > 0 && (
          <Card className="flex flex-col gap-3 p-5">
            <span className="text-[13px] font-semibold">What would move it</span>
            <div className="grid gap-3 md:grid-cols-3">
              {e.scenarios.map((sc) => (
                <div key={sc.key} className="flex items-center gap-3 rounded-[14px] p-4" style={{ background: sc.direction === "up" ? "var(--grade-a-bg)" : "var(--danger-bg)" }}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[12px] font-bold">{sc.label}</span>
                    <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{sc.change}</span>
                  </div>
                  <span className="ml-auto flex flex-col items-end gap-1">
                    <GradeBadge grade={sc.after.grade} score={sc.after.score} />
                    {!sc.after.routable && <span className="text-[10px] font-bold" style={{ color: "var(--danger)" }}>not tradable</span>}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
              Each result is this token re-scored with one input changed — the rubric&apos;s own answer, not a forecast. Rated every day; a change must hold three days before it reaches you. This rating updates as more information becomes public.
            </span>
          </Card>
        )}

        <Link href="/help" className="self-start text-[13px] font-semibold">How ratings work →</Link>
      </div>
    </Shell>
  );
}
