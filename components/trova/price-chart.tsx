"use client";

// The asset chart as the canvas draws it: range tabs top-right (1D 1W 1M 3M 1Y), a single ink line
// with a dot on the latest price, faint gridlines, three price labels on the left and five dates
// along the bottom. The listed share, where the units match, is a faint dashed line behind.

import { useMemo, useState } from "react";

import { NUM } from "@/components/trova/kit";
import type { PriceHistory } from "@/lib/types";

const RANGES = [["1D", 1], ["1W", 7], ["1M", 30], ["3M", 90], ["1Y", 365]] as const;
export type RangeKey = (typeof RANGES)[number][0];

type Pt = { t: number; v: number };

export function useRangeSeries(history: PriceHistory | null, range: RangeKey) {
  return useMemo(() => {
    if (!history) return { token: [] as Pt[], ref: [] as Pt[] };
    if (range === "1D") {
      const d = history.intraday;
      return {
        token: (d?.token ?? []).map((c) => ({ t: c.time, v: c.close })),
        ref: (d?.reference?.closes ?? []).map((c) => ({ t: c.time, v: c.close })),
      };
    }
    const days = RANGES.find(([k]) => k === range)![1];
    const all = history.daily.token.map((c) => ({ t: c.time, v: c.close }));
    const end = all.at(-1)?.t ?? Date.now() / 1000;
    const cut = end - days * 86_400;
    return {
      token: all.filter((p) => p.t >= cut),
      ref: (history.daily.reference?.closes ?? []).map((c) => ({ t: c.time, v: c.close })).filter((p) => p.t >= cut),
    };
  }, [history, range]);
}

export function RangeTabs({ value, onChange, available, full }: { value: RangeKey; onChange: (r: RangeKey) => void; available: (r: RangeKey) => boolean; full?: boolean }) {
  return (
    <div role="tablist" aria-label="Range" style={{ display: "flex", gap: full ? 5 : 6 }}>
      {RANGES.map(([k]) => {
        const on = value === k;
        const ok = available(k);
        return (
          <button key={k} type="button" role="tab" aria-selected={on} disabled={!ok} onClick={() => onChange(k)}
            style={{ flexGrow: full ? 1 : 0, display: "inline-flex", justifyContent: "center", borderRadius: full ? 9 : 8, padding: full ? "8px 0" : "6px 12px", fontSize: 11, fontWeight: on ? 700 : 600, border: "none", cursor: ok ? "pointer" : "default", background: on ? "var(--ink)" : "transparent", color: on ? "var(--surface)" : "var(--ink-faint)", opacity: ok ? 1 : 0.35, fontFamily: "inherit" }}>
            {k}
          </button>
        );
      })}
    </div>
  );
}

export function PriceChart({ token, reference, height = 248, labels = true, refLabel }: { token: Pt[]; reference?: Pt[]; height?: number; labels?: boolean; refLabel?: string }) {
  if (token.length < 2) {
    return <div style={{ height: Math.min(height, 140), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--ink-faint)" }}>Not enough trades in this range to draw.</div>;
  }
  const W = 1000;
  const H = height;
  const pad = 6;
  const vals = [...token.map((p) => p.v), ...(reference ?? []).map((p) => p.v)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || max * 0.02 || 1;
  const t0 = token[0].t;
  const t1 = token[token.length - 1].t;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2 - 4);
  const line = (ps: Pt[]) => ps.filter((p) => p.t >= t0 && p.t <= t1).map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = token[token.length - 1];
  const intraday = t1 - t0 < 2 * 86_400;
  const fmtT = (t: number) => new Date(t * 1000).toLocaleString("en-GB", intraday ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));
  const fmtP = (v: number) => (v >= 1000 ? `$${Math.round(v).toLocaleString("en-US")}` : v >= 10 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`);

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Price from ${fmtP(token[0].v)} to ${fmtP(last.v)}`} style={{ display: "block", overflow: "visible" }}>
        <g stroke="var(--track)" strokeWidth="1">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} vectorEffect="non-scaling-stroke" />)}
        </g>
        {reference && reference.length > 1 && (
          <polyline points={line(reference)} fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" opacity="0.7" />
        )}
        <polyline points={line(token)} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* the end dot and labels are HTML so they don't stretch with the chart */}
      <div style={{ position: "relative", height: 0 }}>
        <span style={{ position: "absolute", right: -4, top: -(H - y(last.v)) - 4.5, width: 9, height: 9, borderRadius: 999, background: "var(--ink)" }} />
        {labels && (
          <>
            <span style={{ ...NUM, position: "absolute", left: 4, top: -(H - pad) + 2, fontSize: 10, color: "var(--ink-faint)" }}>{fmtP(max)}</span>
            <span style={{ ...NUM, position: "absolute", left: 4, top: -(H / 2) - 6, fontSize: 10, color: "var(--ink-faint)" }}>{fmtP((max + min) / 2)}</span>
            <span style={{ ...NUM, position: "absolute", left: 4, top: -pad - 16, fontSize: 10, color: "var(--ink-faint)" }}>{fmtP(min)}</span>
          </>
        )}
      </div>
      {labels && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px 2px" }}>
          {ticks.map((t, i) => <span key={i} style={{ fontSize: 10, color: "var(--ink-faint)" }}>{fmtT(t)}</span>)}
        </div>
      )}
      {refLabel && reference && reference.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--ink-faint)", padding: "2px 4px 0" }}>
          <span style={{ width: 16, borderTop: "1.5px dashed var(--ink-faint)" }} />{refLabel}
        </div>
      )}
    </div>
  );
}

export const RANGE_KEYS = RANGES.map(([k, d]) => ({ key: k, days: d }));
