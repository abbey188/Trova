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

export function PriceChart({ token, reference, height = 248, labels = true, tokenLabel, refLabel }: { token: Pt[]; reference?: Pt[]; height?: number; labels?: boolean; tokenLabel?: string; refLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (token.length < 2) {
    return <div style={{ height: Math.min(height, 140), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--ink-faint)" }}>Not enough trades in this range to draw.</div>;
  }
  const W = 1000;
  const H = height;
  const pad = 6;
  const refIn = (reference ?? []).filter((p) => p.t >= token[0].t && p.t <= token[token.length - 1].t);
  const vals = [...token.map((p) => p.v), ...refIn.map((p) => p.v)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || max * 0.02 || 1;
  const t0 = token[0].t;
  const t1 = token[token.length - 1].t;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2 - 4);
  const line = (ps: Pt[]) => ps.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = token[token.length - 1];
  // Up is green, down is red.
  const stroke = last.v >= token[0].v ? "var(--grade-a)" : "var(--danger)";
  const intraday = t1 - t0 < 2 * 86_400;
  const fmtT = (t: number) => new Date(t * 1000).toLocaleString("en-GB", intraday ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });
  const fmtFull = (t: number) => new Date(t * 1000).toLocaleString("en-GB", intraday ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));
  const fmtP = (v: number) => (v >= 1000 ? `$${Math.round(v).toLocaleString("en-US")}` : v >= 10 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`);
  const fmtExact = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v >= 10 ? 2 : 4 })}`;

  const nearest = (ps: Pt[], t: number) => ps.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), ps[0]);
  const hp = hover != null ? token[hover] : null;
  const hr = hp && refIn.length ? nearest(refIn, hp.t) : null;
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < token.length; i++) if (Math.abs(token[i].t - t) < Math.abs(token[best].t - t)) best = i;
    setHover(best);
  };
  const hx = hp ? (x(hp.t) / W) * 100 : 0;

  return (
    <div>
      <div style={{ position: "relative", touchAction: "pan-y" }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Price from ${fmtP(token[0].v)} to ${fmtP(last.v)}`} style={{ display: "block", overflow: "visible" }}>
          <g stroke="var(--track)" strokeWidth="1">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} vectorEffect="non-scaling-stroke" />)}
          </g>
          {refIn.length > 1 && (
            <polyline points={line(refIn)} fill="none" stroke="var(--ink-faint)" strokeWidth="1.4" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" opacity="0.8" />
          )}
          <polyline points={line(token)} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hp && <line x1={x(hp.t)} x2={x(hp.t)} y1={0} y2={H} stroke="var(--ink-faint)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* dots and labels are HTML so they don't stretch with the chart */}
        <span style={{ position: "absolute", right: -4, top: y(last.v) - 4.5, width: 9, height: 9, borderRadius: 999, background: stroke, pointerEvents: "none" }} />
        {hp && <span style={{ position: "absolute", left: `calc(${hx}% - 5px)`, top: y(hp.v) - 5, width: 10, height: 10, borderRadius: 999, background: "var(--surface)", border: `2.5px solid ${stroke}`, pointerEvents: "none" }} />}
        {labels && (
          <>
            <span style={{ ...NUM, position: "absolute", left: 4, top: pad - 2, fontSize: 10, color: "var(--ink-faint)", pointerEvents: "none" }}>{fmtP(max)}</span>
            <span style={{ ...NUM, position: "absolute", left: 4, top: H / 2 - 14, fontSize: 10, color: "var(--ink-faint)", pointerEvents: "none" }}>{fmtP((max + min) / 2)}</span>
            <span style={{ ...NUM, position: "absolute", left: 4, bottom: pad + 2, fontSize: 10, color: "var(--ink-faint)", pointerEvents: "none" }}>{fmtP(min)}</span>
          </>
        )}
        {hp && (
          <div style={{ position: "absolute", top: 4, left: `${hx}%`, transform: hx > 70 ? "translateX(calc(-100% - 12px))" : "translateX(12px)", background: "var(--ink)", color: "var(--surface)", borderRadius: 10, padding: "8px 11px", fontSize: 11, lineHeight: 1.45, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 8px 24px rgba(20,22,26,0.18)", zIndex: 2 }}>
            <div style={{ opacity: 0.7 }}>{fmtFull(hp.t)}</div>
            <div style={{ ...NUM, fontWeight: 700 }}>{fmtExact(hp.v)} <span style={{ fontWeight: 500, opacity: 0.7 }}>{tokenLabel ?? "token"}</span></div>
            {hr && <div style={{ ...NUM, fontWeight: 600, opacity: 0.85 }}>{fmtExact(hr.v)} <span style={{ fontWeight: 500, opacity: 0.8 }}>{refLabel ?? "listed share"}</span></div>}
          </div>
        )}
      </div>
      {labels && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px 2px" }}>
          {ticks.map((t, i) => <span key={i} style={{ fontSize: 10, color: "var(--ink-faint)" }}>{fmtT(t)}</span>)}
        </div>
      )}
      {labels && (tokenLabel || (refLabel && refIn.length > 1)) && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 10, color: "var(--ink-faint)", padding: "4px 4px 0", flexWrap: "wrap" }}>
          {tokenLabel && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 2.5, borderRadius: 2, background: stroke }} />{tokenLabel}</span>}
          {refLabel && refIn.length > 1 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, borderTop: "1.5px dashed var(--ink-faint)" }} />{refLabel}</span>}
          <span style={{ flexGrow: 1 }} />
          <span>Hover for prices</span>
        </div>
      )}
    </div>
  );
}

export const RANGE_KEYS = RANGES.map(([k, d]) => ({ key: k, days: d }));
