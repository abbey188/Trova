"use client";

import { useMemo, useState } from "react";

import { signedPercent, usd } from "@/lib/format";

/** A row sparkline. Colour follows direction over the window; nothing is drawn from fewer than 2 points. */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[] | null | undefined; width?: number; height?: number }) {
  const v = (values ?? []).filter((n) => Number.isFinite(n));
  if (v.length < 2) return <span style={{ width, height }} className="inline-block" aria-hidden="true" />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 2 - ((y - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  const up = v[v.length - 1] >= v[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={up ? "var(--grade-a)" : "var(--grade-d)"} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

const RANGES = [
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "1Y", days: 365 },
] as const;

type Point = { time: number; value: number };

/**
 * A value-over-time chart with range tabs. `time` is unix SECONDS. The caption says what the line
 * is, because "value" means different things: a token's price, or what today's holdings were worth.
 */
export function RangeChart({
  points,
  caption,
  height = 180,
  format = (n: number) => usd(n),
  defaultRange = "3M",
  reference,
}: {
  points: Point[];
  caption: string;
  height?: number;
  format?: (n: number) => string;
  defaultRange?: (typeof RANGES)[number]["key"];
  /** An optional second series drawn faintly behind, e.g. the listed stock's real price. */
  reference?: { label: string; points: Point[] } | null;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>(defaultRange);
  const available = points.length ? (points[points.length - 1].time - points[0].time) / 86_400 : 0;

  const { series, ref, first, last } = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const cutoff = (points.at(-1)?.time ?? 0) - days * 86_400;
    const series = points.filter((p) => p.time >= cutoff);
    const ref = reference?.points.filter((p) => p.time >= cutoff) ?? [];
    return { series, ref, first: series[0], last: series.at(-1) };
  }, [points, reference, range]);

  if (series.length < 2 || !first || !last) {
    return <div className="flex h-[120px] items-center justify-center text-[12px]" style={{ color: "var(--ink-faint)" }}>Not enough history to draw yet.</div>;
  }

  const all = [...series.map((p) => p.value), ...ref.map((p) => p.value)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.08 || max * 0.02 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const t0 = first.time;
  const t1 = last.time;
  const W = 1000;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const line = (ps: Point[]) => ps.map((p) => `${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const change = last.value - first.value;
  const pct = first.value ? (change / first.value) * 100 : null;
  const up = change >= 0;
  const stroke = up ? "var(--grade-a)" : "var(--grade-d)";
  const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-[13px] font-bold" style={{ color: stroke }}>
          {up ? "▲" : "▼"} {format(Math.abs(change))}{pct != null ? ` · ${signedPercent(pct, 1)}` : ""}
        </span>
        <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>{caption}, {range}</span>
        <div className="ml-auto flex gap-1" role="tablist" aria-label="Range">
          {RANGES.map((r) => {
            const disabled = r.days > 7 && available < r.days * 0.5 && r.key !== "1W";
            return (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={range === r.key}
                disabled={disabled}
                onClick={() => setRange(r.key)}
                className="tabular rounded-[8px] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-35"
                style={range === r.key ? { background: "var(--ink)", color: "var(--surface)" } : { color: "var(--ink-soft)" }}
              >
                {r.key}
              </button>
            );
          })}
        </div>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${caption}: ${format(first.value)} to ${format(last.value)}`}>
        <defs>
          <linearGradient id="trova-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="var(--hairline)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {ref.length > 1 && (
          <polyline points={line(ref)} fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
        <polygon points={`0,${height} ${line(series)} ${W},${height}`} fill="url(#trova-area)" />
        <polyline points={line(series)} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex text-[10px]" style={{ color: "var(--ink-faint)" }}>
        <span>{fmtDate(t0)}</span>
        {reference && ref.length > 1 && (
          <span className="mx-auto inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed" style={{ borderColor: "var(--ink-faint)" }} />{reference.label}</span>
        )}
        <span className="ml-auto">{fmtDate(t1)}</span>
      </div>
    </div>
  );
}

/**
 * Ownership and Exit over the days we have watched them. The point of the chart is the contrast:
 * what you own barely moves; whether you can leave moves every day.
 */
export function RatingHistory({ points }: { points: { date: string; ownership: number; exit: number }[] }) {
  if (points.length < 2) {
    return <p className="text-[12px]" style={{ color: "var(--ink-faint)" }}>Rated daily; a line appears after the second day.</p>;
  }
  const H = 120;
  const W = 1000;
  const values = points.flatMap((p) => [p.ownership, p.exit]);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 8) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 8) / 10) * 10);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const line = (k: "ownership" | "exit") => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const own = points.map((p) => p.ownership);
  const exit = points.map((p) => p.exit);
  const describe = (vals: number[], name: string) =>
    Math.min(...vals) === Math.max(...vals) ? `${name} held at ${vals[0]} every day` : `${name} moved between ${Math.min(...vals)} and ${Math.max(...vals)}`;
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--ink-soft)" }}>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded" style={{ background: "var(--grade-b)" }} />Ownership</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded" style={{ background: "var(--ink)" }} />Exit</span>
        <span className="ml-auto">{hi} – {lo}</span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${describe(own, "Ownership")}; ${describe(exit, "Exit")}`}>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--hairline)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={line("ownership")} fill="none" stroke="var(--grade-b)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={line("exit")} fill="none" stroke="var(--ink)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex text-[10px]" style={{ color: "var(--ink-faint)" }}>
        <span>{fmt(points[0].date)}</span>
        <span className="ml-auto">{fmt(points[points.length - 1].date)} · checked daily</span>
      </div>
      <p className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{describe(own, "Ownership")}. {describe(exit, "Exit")}.</p>
    </div>
  );
}
