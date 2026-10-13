// Shared pieces of the lenders section: the sheet table, the segment tabs and the formatting they use.
// Server components — the kit's client values can't be spread here, so the few styles are restated
// (as on /docs).

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { SEGMENTS, type CollateralRow } from "@/lib/collateral";

export const DISPLAY = { fontFamily: "var(--font-display), system-ui" } as const;
export const NUM = { ...DISPLAY, fontVariantNumeric: "tabular-nums" } as const;
export const PANEL = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 18 } as const;

export const money = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${n / 1e6}M` : n >= 1e3 ? `$${n / 1e3}k` : `$${n}`);
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}%`);
export const REDEEMS: Record<string, string> = { share_redeemable: "The share", cash_redeemable: "Cash value", not_redeemable: "Nothing" };

export const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--ink-soft)", maxWidth: "72ch" }}>{children}</p>;
export const Eyebrow = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>{children}</span>;

export const TH: CSSProperties = { textAlign: "left", padding: "10px 14px", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, whiteSpace: "nowrap" };
export const TD: CSSProperties = { padding: "11px 14px", verticalAlign: "top", lineHeight: 1.5 };

export function controlsText(r: CollateralRow): string {
  const c = r.controls;
  if (!c) return "not read";
  const can = [c.canSeize && "move tokens", c.canPause && "pause", c.canFreeze && "freeze", c.canMint && "mint"].filter(Boolean).join(", ");
  const fee = (c.transferFeeBps ?? 0) > 0 ? ` · ${(c.transferFeeBps! / 100).toFixed(2)}% transfer fee` : "";
  return `${can || "none"}${fee}`;
}

export function outOfHours(r: CollateralRow): string {
  const x = r.closed;
  if (!x) return "not measured";
  if (x.status5k === "market-closed") return "does not trade";
  if (x.status5k === "ok") return `${pct(x.cost5kPct)} at $5k${x.under1Usd ? ` · ${money(x.under1Usd)} under 1%` : ""}`;
  return x.status5k === "no-route" ? "no route at $5k" : "not measured";
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ ...PANEL, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...NUM, fontSize: 26, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>{label}</span>
    </div>
  );
}

/** The four figures that head the sheet and each segment, computed from the rows shown. */
export function Stats({ rows }: { rows: CollateralRow[] }) {
  const inHours = rows.filter((r) => r.open);
  const million = inHours.filter((r) => (r.open!.under1Usd ?? 0) >= 1_000_000).length;
  const shut = rows.filter((r) => r.closed?.status5k === "market-closed").length;
  const tradesShut = rows.filter((r) => r.closed?.status5k === "ok").length;
  const read = rows.filter((r) => r.controls).length;
  const seize = rows.filter((r) => r.controls?.canSeize).length;
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
      <Stat value={`${inHours.length} of ${rows.length}`} label="tokens with a stored in-hours measurement" />
      <Stat value={String(million)} label="leave $1M or more for under 1% in market hours" />
      <Stat value={`${tradesShut} / ${shut}`} label="quoted at $5,000 with the US market shut / do not trade then" />
      <Stat value={`${seize} of ${read}`} label="mints whose issuer can move tokens out of any wallet" />
    </section>
  );
}

/** Tabs across the section: the whole sheet, then one page per issuer group. */
export function SegmentNav({ active }: { active: string }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link key={href} href={href} style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", color: on ? "var(--surface)" : "var(--ink)", background: on ? "var(--ink)" : "var(--surface)", border: on ? "1px solid var(--ink)" : "1px solid var(--hairline)" }}>{label}</Link>
  );
  return (
    <nav aria-label="Sections of the collateral sheet" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {tab("/lenders", "All tokens", active === "all")}
      {SEGMENTS.map((s) => tab(`/lenders/${s.slug}`, s.label, active === s.slug))}
    </nav>
  );
}

export function SheetTable({ rows }: { rows: CollateralRow[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 980 }}>
        <thead>
          <tr style={{ background: "var(--canvas)" }}>
            <th style={TH}>Token</th>
            <th style={TH}>Redeems for</th>
            <th style={TH}>Issuer can</th>
            <th style={{ ...TH, textAlign: "right" }}>$5k round trip</th>
            <th style={{ ...TH, textAlign: "right" }}>Leaves under 1%</th>
            <th style={{ ...TH, textAlign: "right" }}>Sellable inside a 5% bonus</th>
            <th style={TH}>Market shut</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mint} style={{ borderTop: "1px solid var(--track)" }}>
              <td style={TD}>
                <Link href={`/lenders/${r.mint}`} style={{ ...DISPLAY, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{r.symbol}</Link>
                {r.speculative && <span style={{ marginLeft: 7, borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
                <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{r.issuer}</div>
              </td>
              <td style={TD}>{r.redemption ? REDEEMS[r.redemption] ?? r.redemption : "Not reported"}</td>
              <td style={{ ...TD, color: "var(--ink-soft)" }}>{controlsText(r)}</td>
              <td style={{ ...TD, ...NUM, textAlign: "right" }}>{r.open ? (r.open.status5k === "ok" ? pct(r.open.cost5kPct) : r.open.status5k === "no-route" ? "no route" : "—") : "—"}</td>
              <td style={{ ...TD, ...NUM, textAlign: "right", fontWeight: 700 }}>
                {r.open ? (r.open.under1Usd ? money(r.open.under1Usd) : "none") : "—"}
                {r.open?.filledBy === "market-maker" && <div style={{ fontSize: 10, fontWeight: 500, color: "var(--ink-faint)", fontFamily: "inherit" }}>market maker</div>}
              </td>
              <td style={{ ...TD, ...NUM, textAlign: "right" }}>{r.open ? (r.liquidatableAt5Usd ? money(r.liquidatableAt5Usd) : "none") : "—"}</td>
              <td style={{ ...TD, color: "var(--ink-soft)" }}>{outOfHours(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const DOWNLOADS = (
  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    <a href="/api/collateral?format=csv" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", textDecoration: "none" }}>Download the sheet (CSV)</a>
    <a href="/api/collateral" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>JSON</a>
    <Link href="/docs" style={{ fontSize: 13, color: "var(--ink-soft)", padding: "0 6px" }}>How it is measured</Link>
  </div>
);
