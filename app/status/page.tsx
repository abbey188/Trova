// /status — the state of Trova's record. Which days were measured, how much of the token list each
// run reached, and which method each daily snapshot was written under. A measurement cannot be taken
// after the fact, so a gap here is permanent — and is shown, not hidden.

import { unstable_cache } from "next/cache";
import Link from "next/link";

import { AppFrame } from "@/components/trova/frame";
import type { CoverageDay } from "@/lib/exit-store";
import { buildStatus } from "@/lib/status";

import { DISPLAY, Eyebrow, NUM, P, TD, TH } from "../lenders/parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "The record · Trova", description: "Which days Trova measured, how many tokens each run reached, and the method behind each daily snapshot." };

const status = unstable_cache(async () => buildStatus(), ["record-status-v1"], { revalidate: 300 });

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function Cell({ c, total, shut }: { c: CoverageDay | null; total: number | null; shut?: boolean }) {
  if (!c) return <td style={{ ...TD, color: "var(--ink-faint)" }}>not measured</td>;
  const share = total ? Math.round((c.tokens / total) * 100) : null;
  return (
    <td style={TD}>
      <span style={{ ...NUM, fontWeight: 700 }}>{c.tokens}{total ? ` of ${total}` : ""}</span>
      {share != null && <span style={{ color: "var(--ink-faint)" }}> · {share}%</span>}
      <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
        {c.quoted} quoted · {c.noRoute} no route{shut ? ` · ${c.marketClosed} do not trade` : ""} · {time(c.firstAt)}–{time(c.lastAt)} UTC
      </div>
    </td>
  );
}

export default async function StatusPage() {
  const s = await status().catch(() => null);
  const box = { overflowX: "auto" as const, border: "1px solid var(--hairline)", borderRadius: 14 };
  const table = { width: "100%", borderCollapse: "collapse" as const, fontSize: 13, minWidth: 640 };

  return (
    <AppFrame active="none">
      <main style={{ padding: "34px clamp(16px, 4vw, 48px) 60px", display: "flex", flexDirection: "column", gap: 26, maxWidth: 1040 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Eyebrow>The record</Eyebrow>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>What was measured, and when</h1>
          <P>Trova quotes what it costs to leave each token every day, in US market hours and outside them. A quote exists only when it is taken, so a day that was not measured can never be filled in. This page lists every day and how much of the token list each run reached, gaps included.</P>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            <Link href="/lenders" style={{ color: "var(--ink)" }}>The collateral sheet</Link>
            <Link href="/docs" style={{ color: "var(--ink)" }}>The method</Link>
            <a href="/api/status" style={{ color: "var(--ink)" }}>This page as JSON</a>
          </div>
        </header>

        {!s ? <P>The record&apos;s status is unavailable right now.</P> : (
          <>
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ ...DISPLAY, margin: 0, fontSize: 20, fontWeight: 700 }}>Exit measurements</h2>
              {s.days.length === 0 ? <P>No measurement is stored yet.</P> : (
                <div style={box}>
                  <table style={table}>
                    <thead><tr style={{ background: "var(--canvas)" }}><th style={TH}>Date</th><th style={TH}>US market open</th><th style={TH}>US market shut</th></tr></thead>
                    <tbody>
                      {s.days.map((d) => (
                        <tr key={d.date} style={{ borderTop: "1px solid var(--track)" }}>
                          <td style={{ ...TD, ...NUM, whiteSpace: "nowrap" }}>{d.date}</td>
                          <Cell c={d.open} total={s.tokens} />
                          <Cell c={d.closed} total={s.tokens} shut />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <P>Measured since {new Date(s.measuredSince).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. A run measures the most traded tokens first and reaches the rest in turn, so on a day with partial coverage the tokens missed are the least traded ones. Weekends have no open session.</P>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ ...DISPLAY, margin: 0, fontSize: 20, fontWeight: 700 }}>Daily snapshots</h2>
              <div style={box}>
                <table style={table}>
                  <thead><tr style={{ background: "var(--canvas)" }}><th style={TH}>Date</th><th style={TH}>Method</th><th style={{ ...TH, textAlign: "right" }}>Tokens rated</th><th style={{ ...TH, textAlign: "right" }}>Source errors</th></tr></thead>
                  <tbody>
                    {s.snapshots.map((r) => (
                      <tr key={r.date} style={{ borderTop: "1px solid var(--track)" }}>
                        <td style={{ ...TD, ...NUM }}>{r.date}</td>
                        <td style={{ ...TD, ...NUM }}>{r.methodVersion}</td>
                        <td style={{ ...TD, ...NUM, textAlign: "right" }}>{r.tokens}</td>
                        <td style={{ ...TD, ...NUM, textAlign: "right" }}>{r.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>Snapshots dated before 13 October 2026 were written under method v3.2, which read pool depth and could not see tokens that market makers fill. Their Ownership scores stand; their Exit scores and grades describe pools, not the token, and no alert is drawn from them. The method running now is {s.methodVersion}.</P>
            </section>
          </>
        )}
      </main>
    </AppFrame>
  );
}
