"use client";

// The design canvas's components, drawn exactly as the boards draw them. Every screen composes these,
// so a pill, a ring or a card looks the same everywhere — the canvas is the spec.

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";

import { brandFor, initialsFor } from "@/lib/brand";
import type { Rating } from "@/lib/types";

export const DISPLAY: CSSProperties = { fontFamily: "var(--font-display), system-ui" };
export const NUM: CSSProperties = { ...DISPLAY, fontVariantNumeric: "tabular-nums" };

// ---------------------------------------------------------------------------- company logo

/** A company's logo when there is a clean one, otherwise the canvas's brand disc with its initial. */
export function CompanyLogo({ src, name, id, size = 38 }: { src?: string | null; name: string; id?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const shape: CSSProperties = { width: size, height: size, borderRadius: 999, flexShrink: 0 };
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    // Ticker logos (/api/logo) are white marks made for dark grounds: a dark disc, the mark inset.
    const dark = src.startsWith("/api/logo/");
    return <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} style={{ ...shape, boxSizing: "border-box", objectFit: dark ? "contain" : "cover", padding: dark ? Math.round(size * 0.16) : 0, background: dark ? "#1F2227" : "#fff", boxShadow: dark ? "0 0 0 1px rgba(255,255,255,0.16)" : "0 0 0 1px rgba(20,22,26,0.06)" }} />;
  }
  return (
    <span aria-hidden="true" style={{ ...shape, ...DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", background: brandFor(id ?? name), color: "#fff", fontSize: Math.round(size * 0.38), fontWeight: 700 }}>
      {initialsFor(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------- grades

const TONE: Record<Rating, { fg: string; bg: string }> = {
  A: { fg: "var(--grade-a)", bg: "var(--grade-a-bg)" },
  B: { fg: "var(--grade-b)", bg: "var(--grade-b-bg)" },
  C: { fg: "var(--grade-c)", bg: "var(--grade-c-bg)" },
  D: { fg: "var(--grade-d)", bg: "var(--grade-d-bg)" },
  NR: { fg: "var(--grade-nr)", bg: "var(--grade-nr-bg)" },
};
export const gradeTone = (g: Rating) => TONE[g] ?? TONE.NR;
export const gradeOf = (s: number): Rating => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : "D");

/** "A 87" — a grade never shows without its number (flow rule). */
export function GradePill({ grade, score, size = "md", onWhite }: { grade: Rating; score: number | null; size?: "sm" | "md" | "lg"; onWhite?: boolean }) {
  const t = gradeTone(grade);
  const s = size === "lg" ? { fontSize: 16, padding: "6px 14px", gap: 6 } : size === "sm" ? { fontSize: 11, padding: "2px 8px", gap: 4 } : { fontSize: 12, padding: "4px 10px", gap: 5 };
  return (
    <span style={{ ...NUM, display: "inline-flex", alignItems: "center", borderRadius: 999, fontWeight: 700, color: t.fg, background: onWhite ? "var(--surface)" : t.bg, ...s }}>
      {grade}{score != null && <span>{score}</span>}
    </span>
  );
}

/** The score ring: grey track, coloured arc, the number with its letter beneath. */
export function ScoreRing({ score, grade, size = 80 }: { score: number | null; grade: Rating; size?: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const t = gradeTone(grade);
  return (
    <svg width={size} height={size} viewBox="0 0 86 86" style={{ flexShrink: 0 }} role="img" aria-label={score == null ? "Not rated" : `${grade} ${score}`}>
      <circle cx="43" cy="43" r={r} fill="none" stroke="var(--track)" strokeWidth="9" />
      {score != null && <circle cx="43" cy="43" r={r} fill="none" stroke={t.fg} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 43 43)" />}
      <text x="43" y="40" textAnchor="middle" style={DISPLAY} fontSize="21" fontWeight="700" fill="var(--ink)">{score ?? "–"}</text>
      <text x="43" y="55" textAnchor="middle" fontSize="11" fontWeight="700" fill={t.fg}>{grade}</text>
    </svg>
  );
}

/** "Ownership · 83" with its bar. Colour follows the value, red only when you can't get out. */
export function PillarBar({ label, value, height = 6, compact }: { label: string; value: number; height?: number; compact?: boolean }) {
  const fill = value >= 80 ? "var(--grade-a)" : value >= 65 ? "var(--grade-b)" : value >= 50 ? "var(--grade-c)" : "var(--grade-d)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 3 : 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: compact ? 11 : 12, fontWeight: compact ? 500 : 600 }}>{label}</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ ...NUM, fontSize: compact ? 11 : 12, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height, borderRadius: 999, background: fill }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- surfaces

export function Panel({ children, style, className, accent }: { children: ReactNode; style?: CSSProperties; className?: string; accent?: "good" | "danger" }) {
  const border = accent === "good" ? "2px solid var(--grade-a)" : accent === "danger" ? "1px solid var(--danger-line)" : "1px solid var(--hairline)";
  const bg = accent === "danger" ? "var(--danger-soft)" : "var(--surface)";
  return <section className={className} style={{ background: bg, border, borderRadius: 16, ...style }}>{children}</section>;
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600, ...style }}>{children}</span>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "danger" }) {
  const c = tone === "good" ? ["var(--grade-a)", "var(--grade-a-bg)"] : tone === "warn" ? ["var(--grade-c)", "var(--grade-c-bg)"] : tone === "danger" ? ["var(--danger)", "var(--danger-bg)"] : ["var(--ink-soft)", "var(--track)"];
  return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: c[0], background: c[1], whiteSpace: "nowrap" }}>{children}</span>;
}

/** "Why 87 ›" — the way into a rating, as a button tinted by its grade: A/B green, C amber, D red. */
export function WhyButton({ href, grade, score, onClick }: { href: string; grade: Rating; score: number | null; onClick?: () => void }) {
  const tone = grade === "A" || grade === "B" ? { fg: "var(--grade-a)", bg: "var(--grade-a-bg)" } : grade === "C" ? { fg: "var(--grade-c)", bg: "var(--grade-c-bg)" } : grade === "D" ? { fg: "var(--danger)", bg: "var(--danger-bg)" } : { fg: "var(--ink-soft)", bg: "var(--track)" };
  return (
    <Link href={href} onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 30, padding: "0 8px 0 11px", borderRadius: 9, fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", color: tone.fg, background: tone.bg }}>
      Why {score ?? "NR"}{Icon.chevronRight(14, tone.fg)}
    </Link>
  );
}

// ---------------------------------------------------------------------------- charts

/** A row sparkline in the board's style: 1.6px stroke, green up / red down, faded when not tradable. */
export function Spark({ values, width = 110, height = 30, muted }: { values?: number[] | null; width?: number; height?: number; muted?: boolean }) {
  const v = (values ?? []).filter((n) => Number.isFinite(n));
  if (v.length < 2) return <span style={{ display: "inline-block", width, height }} aria-hidden="true" />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - 1 - ((y - min) / span) * (height - 2)).toFixed(1)}`).join(" ");
  // Up is green, down is red.
  const stroke = muted ? "var(--ink-faint)" : v[v.length - 1] >= v[0] ? "var(--grade-a)" : "var(--danger)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block", opacity: muted ? 0.4 : 1, flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------- icons (the canvas's strokes)

export const Icon = {
  home: (s = 19) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></svg>,
  markets: (s = 19) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>,
  updates: (s = 19) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5l3 2" /></svg>,
  logo: (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--action-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>,
  moon: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>,
  bell: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
  search: (s = 15) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  back: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>,
  chevronRight: (s = 15, c = "currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>,
  chevronDown: (s = 11) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>,
  up: (s = 12) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>,
  down: (s = 12) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>,
  star: (s = 16, filled = false) => <svg width={s} height={s} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.9 9.1 9z" /></svg>,
  check: (s = 11) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>,
  lock: (s = 13) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
  close: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
  copy: (s = 13) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>,
  pencil: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  warn: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
};
