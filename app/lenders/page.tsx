// /lenders — the collateral sheet. For a risk team deciding what to lend against a tokenized stock:
// what the holder can redeem, what the issuer can do on-chain, and how much actually leaves — in US
// market hours and outside them. Every figure is reported, read from the mint, or measured; the
// lender arithmetic is shown with its inequality and is never a recommendation.

import { unstable_cache } from "next/cache";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppFrame } from "@/components/trova/frame";
import { buildCollateralSheet, LIQUIDATOR_MARGIN_PCT, type CollateralRow } from "@/lib/collateral";

export const dynamic = "force-dynamic";
export const metadata = { title: "For lenders · Trova", description: "What each tokenized stock on Solana can absorb, measured: redemption, issuer controls and exit capacity by market session." };

// Server component: the kit's client values can't be spread here, so restated (as on /docs).
const DISPLAY = { fontFamily: "var(--font-display), system-ui" } as const;
const NUM = { ...DISPLAY, fontVariantNumeric: "tabular-nums" } as const;
const PANEL = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 18 } as const;

const sheetData = unstable_cache(async () => buildCollateralSheet(), ["collateral-sheet-v1"], { revalidate: 600 });

const money = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${n / 1e6}M` : n >= 1e3 ? `$${n / 1e3}k` : `$${n}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}%`);
const REDEEMS: Record<string, string> = { share_redeemable: "The share", cash_redeemable: "Cash value", not_redeemable: "Nothing" };
const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--ink-soft)", maxWidth: "72ch" }}>{children}</p>;

function controlsText(r: CollateralRow): string {
  const c = r.controls;
  if (!c) return "not read";
  const can = [c.canSeize && "move tokens", c.canPause && "pause", c.canFreeze && "freeze", c.canMint && "mint"].filter(Boolean).join(", ");
  const fee = (c.transferFeeBps ?? 0) > 0 ? ` · ${(c.transferFeeBps! / 100).toFixed(2)}% transfer fee` : "";
  return `${can || "none"}${fee}`;
}

function outOfHours(r: CollateralRow): string {
  const x = r.closed;
  if (!x) return "not measured";
  if (x.status5k === "market-closed") return "does not trade";
  if (x.status5k === "ok") return `${pct(x.cost5kPct)} at $5k${x.under1Usd ? ` · ${money(x.under1Usd)} under 1%` : ""}`;
  return x.status5k === "no-route" ? "no route at $5k" : "not measured";
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ ...PANEL, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...NUM, fontSize: 26, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>{label}</span>
    </div>
  );
}

const SHOWN = 80;

export default async function LendersPage() {
  const sheet = await sheetData().catch(() => null);
  const rows = sheet?.rows ?? [];
  const inHours = rows.filter((r) => r.open);
  const million = inHours.filter((r) => (r.open!.under1Usd ?? 0) >= 1_000_000);
  const shut = rows.filter((r) => r.closed?.status5k === "market-closed").length;
  const tradesShut = rows.filter((r) => r.closed?.status5k === "ok").length;
  const seize = rows.filter((r) => r.controls?.canSeize).length;
  const read = rows.filter((r) => r.controls).length;
  const th = { textAlign: "left" as const, padding: "10px 14px", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" as const, color: "var(--ink-faint)", fontWeight: 700, whiteSpace: "nowrap" as const };
  const td = { padding: "11px 14px", verticalAlign: "top" as const, lineHeight: 1.5 };

  return (
    <AppFrame active="none">
      <main style={{ padding: "34px clamp(16px, 4vw, 48px) 60px", display: "flex", flexDirection: "column", gap: 26, maxWidth: 1240 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>For lenders · the collateral sheet</span>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>What each tokenized stock can absorb, measured</h1>
          <P>One row per token on Solana: what the holder can redeem, what the issuer can do to the token on-chain, and how much leaves for under 1% — quoted as a real round trip on the better of Jupiter&apos;s two routes, in US market hours and outside them. Pool depth is not on this page: most of these tokens are filled by market makers, and their pools say nothing about what can be sold.</P>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <a href="/api/collateral?format=csv" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", textDecoration: "none" }}>Download the sheet (CSV)</a>
            <a href="/api/collateral" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>JSON</a>
            <Link href="/docs" style={{ fontSize: 13, color: "var(--ink-soft)", padding: "0 6px" }}>How it is measured</Link>
          </div>
        </header>

        {!sheet ? <P>The collateral sheet is unavailable right now.</P> : (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              <Stat value={`${inHours.length} of ${sheet.tokens}`} label="tokens with a stored in-hours measurement" />
              <Stat value={String(million.length)} label="leave $1M or more for under 1% in market hours" />
              <Stat value={`${tradesShut} / ${shut}`} label="quoted at $5,000 with the US market shut / do not trade then" />
              <Stat value={`${seize} of ${read}`} label="mints whose issuer can move tokens out of any wallet" />
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: "var(--canvas)" }}>
                      <th style={th}>Token</th>
                      <th style={th}>Redeems for</th>
                      <th style={th}>Issuer can</th>
                      <th style={{ ...th, textAlign: "right" }}>$5k round trip</th>
                      <th style={{ ...th, textAlign: "right" }}>Leaves under 1%</th>
                      <th style={{ ...th, textAlign: "right" }}>Sellable inside a 5% bonus</th>
                      <th style={th}>Market shut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, SHOWN).map((r) => (
                      <tr key={r.mint} style={{ borderTop: "1px solid var(--track)" }}>
                        <td style={td}>
                          <Link href={`/asset/${encodeURIComponent(r.assetId)}`} style={{ ...DISPLAY, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{r.symbol}</Link>
                          {r.speculative && <span style={{ marginLeft: 7, borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
                          <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{r.issuer}</div>
                        </td>
                        <td style={td}>{r.redemption ? REDEEMS[r.redemption] ?? r.redemption : "Not reported"}</td>
                        <td style={{ ...td, color: "var(--ink-soft)" }}>{controlsText(r)}</td>
                        <td style={{ ...td, ...NUM, textAlign: "right" }}>{r.open ? (r.open.status5k === "ok" ? pct(r.open.cost5kPct) : r.open.status5k === "no-route" ? "no route" : "—") : "—"}</td>
                        <td style={{ ...td, ...NUM, textAlign: "right", fontWeight: 700 }}>
                          {r.open ? (r.open.under1Usd ? money(r.open.under1Usd) : "none") : "—"}
                          {r.open?.filledBy === "market-maker" && <div style={{ fontSize: 10, fontWeight: 500, color: "var(--ink-faint)", fontFamily: "inherit" }}>market maker</div>}
                        </td>
                        <td style={{ ...td, ...NUM, textAlign: "right" }}>{r.open ? (r.liquidatableAt5Usd ? money(r.liquidatableAt5Usd) : "none") : "—"}</td>
                        <td style={{ ...td, color: "var(--ink-soft)" }}>{outOfHours(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                Showing the {Math.min(SHOWN, rows.length)} tokens with the most in-hours capacity, of {sheet.tokens}. The download has every token and every column. A dash means not yet measured in market hours.
              </span>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ ...DISPLAY, margin: 0, fontSize: 20, fontWeight: 700 }}>How to read it</h2>
              <P><b style={{ color: "var(--ink)" }}>Leaves under 1%</b> is the largest size, from $5,000 up to $25,000,000, whose round trip — buy with USDC, sell straight back — was quoted at under 1%. It is a quote, not an executed trade, and a round trip overstates what selling once costs.</P>
              <P><b style={{ color: "var(--ink)" }}>Sellable inside a 5% bonus</b> is the largest measured size a liquidator could sell and still keep {LIQUIDATOR_MARGIN_PCT} point of a 5% liquidation bonus. A liquidation only happens if selling the collateral costs less than the bonus paid for doing it. Each token&apos;s page shows other bonus levels, and the real share&apos;s largest move across a market closure.</P>
              <P><b style={{ color: "var(--ink)" }}>Issuer can</b> is read from the token&apos;s mint account on Solana. Controls like these are usual for a regulated issuer; they are listed so a lender can see them, and none of them moves a rating.</P>
              <P>Measurements began on {new Date(sheet.measuredSince).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, so this is days of history, not months. What a token can absorb changes with the hour and the day; the sheet shows the latest stored measurement for each session. Nothing here is a recommendation, and a lender adds its own margin.</P>
            </section>
          </>
        )}
      </main>
    </AppFrame>
  );
}
