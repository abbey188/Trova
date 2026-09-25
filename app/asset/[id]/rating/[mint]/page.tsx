// "Why TSLAx is rated A 87" — the RatingDesktop board. Every number behind a rating, each with the
// fact it came from; how the two halves combine; how much we know; how it moved while we watched;
// and what would move it (the rubric re-run with one input changed — never a forecast).

import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/components/trova/frame";
import { HowItWorksLink } from "@/components/trova/landing-bits";
import { CompanyLogo, GradePill, ScoreRing } from "@/components/trova/kit";
import { buildAssetDetail } from "@/lib/asset";
import type { Driver, Scenario } from "@/lib/explain";
import { GRADE_CUTOFFS } from "@/lib/trust-score";
import type { HistoryPoint } from "@/lib/types";

export const revalidate = 120;

// A server component can render the kit's client components but not call or spread its values, so
// the two type styles and the back chevron are restated here.
const DISPLAY = { fontFamily: "var(--font-display), system-ui" } as const;
const NUM = { ...DISPLAY, fontVariantNumeric: "tabular-nums" } as const;
const BACK = <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;

const fill = (v: number) => (v >= 80 ? "var(--grade-a)" : v >= 65 ? "var(--grade-b)" : v >= 50 ? "var(--grade-c)" : "var(--grade-d)");
const PANEL = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 16 } as const;

function Bar({ value }: { value: number }) {
  return (
    <div style={{ height: 7, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: 7, background: fill(value) }} />
    </div>
  );
}

function DriverRow({ d }: { d: Driver }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ ...NUM, fontSize: 13, fontWeight: 700 }}>{d.score ?? "Not reported"}</span>
      </div>
      {d.score != null && <Bar value={d.score} />}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>{d.fact}</span>
        <span style={{ flexGrow: 1 }} />
        {d.weight && <span style={{ fontSize: 11, color: "var(--ink-faint)", whiteSpace: "nowrap" }}>{d.weight.replace(/of (Ownership|Exit)$/, "of this half")}</span>}
      </div>
    </div>
  );
}

function ScenarioCard({ sc }: { sc: Scenario }) {
  const stops = sc.before.routable && !sc.after.routable;
  const bg = stops ? "var(--danger-soft)" : sc.direction === "up" ? "var(--good-soft)" : "var(--warn-soft)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, background: bg, borderRadius: 14, padding: "15px 17px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{sc.label}</span>
        <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ink-soft)" }}>{sc.change}{stops ? ", and it stops being tradable" : ""}</span>
      </div>
      <span style={{ flexGrow: 1 }} />
      {stops ? (
        <span style={{ ...NUM, borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "var(--surface)", whiteSpace: "nowrap" }}>
          {sc.after.grade} {sc.after.score ?? ""} · not tradable
        </span>
      ) : <GradePill grade={sc.after.grade} score={sc.after.score} size="lg" onWhite />}
    </div>
  );
}

/** Ownership (green) and Exit (ink) over the days we've watched it. Gaps stay gaps. */
function HistoryChart({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return <p style={{ margin: 0, fontSize: 12, color: "var(--ink-faint)" }}>Rated daily from its first snapshot — a line appears after the second day.</p>;
  const W = 1000, H = 150;
  const lo = Math.max(0, Math.floor((Math.min(...points.flatMap((p) => [p.ownership, p.exit])) - 5) / 10) * 10);
  const y = (v: number) => 6 + (1 - (v - lo) / (100 - lo)) * (H - 12);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const line = (k: "ownership" | "exit") => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{ ...NUM, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 10, color: "var(--ink-faint)", padding: "4px 0 18px" }}>
        <span>100</span><span>{Math.round((100 + lo) / 2)}</span><span>{lo}</span>
      </div>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Ownership and Exit, daily">
          {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={6 + f * (H - 12)} y2={6 + f * (H - 12)} stroke="var(--track)" vectorEffect="non-scaling-stroke" />)}
          <polyline points={line("ownership")} fill="none" stroke="var(--grade-b)" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <polyline points={line("exit")} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ display: "flex", fontSize: 10, color: "var(--ink-faint)" }}>
          <span>{fmt(points[0].date)}</span><span style={{ flexGrow: 1 }} /><span>{fmt(points.at(-1)!.date)} · checked daily</span>
        </div>
      </div>
    </div>
  );
}

function historyLine(points: HistoryPoint[]): string | null {
  if (points.length < 2) return null;
  const range = (k: "ownership" | "exit") => {
    const v = points.map((p) => p[k]);
    const lo = Math.min(...v), hi = Math.max(...v);
    return lo === hi ? `held at ${lo} every day` : `moved between ${lo} and ${hi}`;
  };
  return `Ownership ${range("ownership")}. Exit ${range("exit")}${points.every((p) => p.ownership === points[0].ownership) ? " on the market alone" : ""}.`;
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
  const exitMain = exit.filter((d) => d.key !== "execution");
  const exitFills = exit.filter((d) => d.key === "execution");
  const cap = e.drivers.find((d) => d.pillar === "cap");
  const reported = e.inputs.filter((i) => i.reported).length;
  const missing = e.inputs.filter((i) => !i.reported).map((i) => i.label.toLowerCase());
  const cutoff = s.grade === "A" ? GRADE_CUTOFFS.A : s.grade === "B" ? GRADE_CUTOFFS.B : s.grade === "C" ? GRADE_CUTOFFS.C : null;
  const points = variant.history?.points ?? [];
  const known = reported / Math.max(1, e.inputs.length);
  const assetHref = `/asset/${encodeURIComponent(assetId)}`;

  const pillarHead = (name: string, value: number) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <h2 style={{ ...DISPLAY, margin: 0, fontSize: 16, fontWeight: 700 }}>{name}</h2>
      <span style={{ flexGrow: 1 }} />
      <span style={{ ...NUM, fontSize: 30, fontWeight: 700 }}>{value}</span>
    </div>
  );

  return (
    <AppFrame active="markets">
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px clamp(14px, 3vw, 26px)", background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}>
        <Link href={assetHref} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", textDecoration: "none", padding: "7px 10px 7px 6px", borderRadius: 9 }}>
          {BACK} {detail.asset.name}
        </Link>
        <span style={{ flexGrow: 1 }} />
        <HowItWorksLink style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 18px", fontSize: 13, border: "1px solid var(--hairline)", borderRadius: 11 }} />
      </header>

      <main style={{ padding: "22px clamp(14px, 3vw, 26px) 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CompanyLogo src={detail.asset.logoUrl} name={detail.asset.name} id={assetId} size={52} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(19px, 4vw, 24px)", fontWeight: 700, letterSpacing: -0.5 }}>
              Why {variant.symbol} is {s.rated ? `rated ${s.grade} ${s.score}` : "not rated"}
            </h1>
            <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{e.headline}{s.borderline ? ` Borderline ${s.borderline.adjacentGrade}.` : ""}</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <span className="hidden md:block"><ScoreRing score={s.score} grade={s.grade} size={78} /></span>
        </div>

        {s.instrument.speculative && (
          <p style={{ margin: 0, borderRadius: 12, padding: "11px 14px", fontSize: 12, lineHeight: 1.55, background: "var(--grade-c-bg)" }}>
            <b style={{ color: "var(--grade-c)" }}>Speculative. </b>{s.instrument.summary} This rating updates as information becomes public.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <section style={{ ...PANEL, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 17 }}>
            {pillarHead("Ownership", s.ownership.score)}
            {ownership.map((d) => <DriverRow key={d.key} d={d} />)}
            <div style={{ display: "flex", alignItems: "center", gap: 9, borderTop: "1px solid var(--track)", paddingTop: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Warnings against this token</span>
              <span style={{ flexGrow: 1 }} />
              <span style={{ ...NUM, fontSize: 13, fontWeight: 700, color: cap ? "var(--danger)" : "var(--grade-a)", textTransform: "capitalize" }}>{cap ? s.advisory?.status ?? "Yes" : "None"}</span>
            </div>
            {cap && <span style={{ fontSize: 12, color: "var(--danger)", marginTop: -8 }}>{cap.fact}</span>}
          </section>
          <section style={{ ...PANEL, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 15 }}>
            {pillarHead("Exit", s.exit.score)}
            {exitMain.map((d) => <DriverRow key={d.key} d={d} />)}
            {exitFills.length > 0 && <div style={{ borderTop: "1px solid var(--track)", paddingTop: 13 }}>{exitFills.map((d) => <DriverRow key={d.key} d={d} />)}</div>}
          </section>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <section className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6" style={{ ...PANEL, flexGrow: 1, padding: "20px 22px" }}>
            <span style={{ ...NUM, fontSize: 21, fontWeight: 700, whiteSpace: "nowrap" }}>√({s.ownership.score} × {s.exit.score}) = {s.score ?? "NR"}</span>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--ink-soft)" }}>
              Multiplied, not averaged. A token can&apos;t buy its way to an A with a busy market if you don&apos;t own anything — or with perfect paperwork nobody will trade.
            </p>
            {cutoff != null && (
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, color: fill(s.score ?? 0), background: s.grade === "A" ? "var(--grade-a-bg)" : "var(--track)", whiteSpace: "nowrap" }}>{s.grade} · cutoff {cutoff}</span>
            )}
          </section>
          <section className="md:w-[320px] md:shrink-0" style={{ ...PANEL, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>How much we know</span>
              <span style={{ flexGrow: 1 }} />
              <span style={{ ...NUM, fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{s.confidence}</span>
            </div>
            <div style={{ marginTop: 10 }}><Bar value={known * 100} /></div>
            <span style={{ display: "block", fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)", marginTop: 9 }}>
              {reported} of {e.inputs.length} inputs reported{missing.length ? ` — missing: ${missing.join(", ")}` : ""}. Missing information lowers confidence — it never quietly improves a rating.
            </span>
          </section>
        </div>

        <section style={{ ...PANEL, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Rating over {points.length} {points.length === 1 ? "day" : "days"}</span>
            {historyLine(points) && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{historyLine(points)}</span>}
            <span style={{ flexGrow: 1 }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-soft)" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--grade-b)" }} />Ownership</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-soft)" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--ink)" }} />Exit</span>
          </div>
          <HistoryChart points={points} />
        </section>

        {e.scenarios.length > 0 && (
          <section style={{ ...PANEL, padding: "19px 22px" }}>
            <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>What would move it</span>
            <div className="mt-[13px] grid gap-[14px] md:grid-cols-3">
              {e.scenarios.map((sc) => <ScenarioCard key={sc.key} sc={sc} />)}
            </div>
            <span style={{ display: "block", fontSize: 11, color: "var(--ink-faint)", marginTop: 13 }}>
              Each is this token re-scored with one input changed — the rubric&apos;s answer, not a forecast. Recomputed every day; a change has to hold three days before it reaches you.
            </span>
          </section>
        )}
      </main>
    </AppFrame>
  );
}
