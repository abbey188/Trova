// /lenders/<slug> — two kinds of page under the collateral sheet:
//   an issuer group (/lenders/ondo, /lenders/xstocks, /lenders/backpack, /lenders/private,
//   /lenders/funds-and-metals) lists every token of that group, and
//   a mint address (/lenders/<mint>) is that token's collateral file: both ladders, what a liquidator
//   could sell inside each bonus, the real share's largest move across a closure, issuer controls,
//   and the capacity history since measurements began.

import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@/components/trova/frame";
import { LIQUIDATOR_MARGIN_PCT, SEGMENTS, type CollateralFile, type SessionExit } from "@/lib/collateral";
import { cachedFile, cachedSheet } from "@/lib/collateral-cache";
import { isSolanaAddress } from "@/lib/helius";

import { DISPLAY, DOWNLOADS, Eyebrow, NUM, P, PANEL, REDEEMS, SegmentNav, SheetTable, Stats, TD, TH, money, pct } from "../parts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const segment = SEGMENTS.find((s) => s.slug === slug);
  return { title: segment ? `${segment.label} · For lenders · Trova` : "Collateral file · Trova" };
}

const MAIN = { padding: "34px clamp(16px, 4vw, 48px) 60px", display: "flex", flexDirection: "column", gap: 26, maxWidth: 1240 } as const;
const H2 = { ...DISPLAY, margin: 0, fontSize: 20, fontWeight: 700 } as const;
const when = (iso: string) => `${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

function Ladder({ title, exit }: { title: string; exit: SessionExit | null }) {
  return (
    <div style={{ ...PANEL, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{exit ? `measured ${when(exit.takenAt)}` : "not measured yet"}</span>
      </div>
      {exit && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={{ ...TH, padding: "6px 0" }}>Size</th><th style={{ ...TH, padding: "6px 0", textAlign: "right" }}>Round trip</th><th style={{ ...TH, padding: "6px 0", textAlign: "right" }}>Filled by</th></tr></thead>
            <tbody>
              {exit.rungs.map((r) => (
                <tr key={r.usdSize} style={{ borderTop: "1px solid var(--track)" }}>
                  <td style={{ ...NUM, padding: "8px 0" }}>{money(r.usdSize)}</td>
                  <td style={{ ...NUM, padding: "8px 0", textAlign: "right", fontWeight: 700, color: r.status !== "ok" ? "var(--ink-soft)" : (r.roundTripPct ?? 0) >= 5 ? "var(--danger)" : "var(--ink)" }}>
                    {r.status === "ok" ? pct(r.roundTripPct) : r.status === "market-closed" ? "does not trade" : r.status === "no-route" ? "no route" : "—"}
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", color: "var(--ink-soft)" }}>{r.status === "ok" ? (r.filledBy === "market-maker" ? "market maker" : "pools") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {exit.under1Usd ? `Under 1% up to ${money(exit.under1Usd)}${exit.over1Usd ? `; over 1% by ${money(exit.over1Usd)}` : ", the largest size measured"}.` : "No size measured under 1%."}
          </span>
        </>
      )}
    </div>
  );
}

function TokenFile({ f }: { f: CollateralFile }) {
  const c = f.controls;
  const controls: [string, string][] = c ? [
    ["Move tokens out of any wallet", c.canSeize ? "Yes" : "No"],
    ["Pause every transfer", c.canPause ? (c.paused ? "Yes — paused now" : "Yes — not paused") : "No"],
    ["Freeze a single account", c.canFreeze ? "Yes" : "No"],
    ["Create more tokens", c.canMint ? "Yes" : "No"],
    ["New accounts start frozen", c.newAccountsFrozen == null ? "No such setting" : c.newAccountsFrozen ? "Yes" : "No — setting exists"],
    ["Run a program on every transfer", c.hookProgram ? "Yes" : c.hookSlot ? "Not now — slot exists" : "No"],
    ["Fee on every transfer", c.transferFeeBps == null ? "None" : c.transferFeeBps > 0 ? `${(c.transferFeeBps / 100).toFixed(2)}%` : "0% — can be set"],
  ] : [];

  return (
    <main style={MAIN}>
      <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Link href="/lenders" style={{ fontSize: 12, color: "var(--ink-soft)", textDecoration: "none" }}>← The collateral sheet</Link>
        <Eyebrow>Collateral file · {f.issuer}</Eyebrow>
        <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>
          {f.symbol}
          {f.speculative && <span style={{ marginLeft: 12, verticalAlign: "middle", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, letterSpacing: 0, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
        </h1>
        <P>
          Redeems for: <b style={{ color: "var(--ink)" }}>{f.redemption ? (REDEEMS[f.redemption] ?? f.redemption).toLowerCase() : "not reported by the issuer"}</b>. Ownership score {f.ownershipScore} of 100.{" "}
          {f.holders != null ? `${f.holders.toLocaleString("en-US")} holders. ` : ""}
          <Link href={`/asset/${encodeURIComponent(f.assetId)}`} style={{ color: "var(--ink)" }}>The rating and price page</Link>.
        </P>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <a href={`/api/collateral/${f.mint}`} style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", textDecoration: "none" }}>This file as JSON</a>
          <span style={{ ...NUM, fontSize: 11, color: "var(--ink-faint)", wordBreak: "break-all" }}>{f.mint}</span>
        </div>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={H2}>What it costs to leave, by size</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
          <Ladder title="US market open" exit={f.open} />
          <Ladder title="US market shut" exit={f.closed} />
        </div>
        <P>Each row is a round trip — buy with USDC, sell straight back — quoted on the better of Jupiter&apos;s two routes. A quote, not an executed trade. Sizes are climbed only while the cost stays under 5%.</P>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={H2}>If it is collateral</h2>
        <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ background: "var(--canvas)" }}>
                <th style={TH}>Liquidation bonus</th>
                <th style={{ ...TH, textAlign: "right" }}>Largest size sellable inside it</th>
                <th style={{ ...TH, textAlign: "right" }}>Exit cost at that size</th>
                <th style={{ ...TH, textAlign: "right" }}>Threshold that survives the gap</th>
              </tr>
            </thead>
            <tbody>
              {f.liquidation.map((l) => (
                <tr key={l.bonusPct} style={{ borderTop: "1px solid var(--track)" }}>
                  <td style={{ ...TD, ...NUM }}>{l.bonusPct}%</td>
                  <td style={{ ...TD, ...NUM, textAlign: "right", fontWeight: 700 }}>{f.open ? (l.sizeUsd ? money(l.sizeUsd) : "none measured") : "—"}</td>
                  <td style={{ ...TD, ...NUM, textAlign: "right" }}>{pct(l.exitCostPct)}</td>
                  <td style={{ ...TD, ...NUM, textAlign: "right" }}>{l.thresholdPct == null ? "—" : l.thresholdPct > 0 ? `${l.thresholdPct.toFixed(0)}%` : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          A liquidation only happens if selling the collateral costs less than the bonus paid for doing it, so the largest sellable size is the largest in-hours size whose exit cost leaves the liquidator {LIQUIDATOR_MARGIN_PCT} point of the bonus.
          {f.closureGap
            ? ` The real ${f.closureGap.ticker} share's largest move across a market closure in the last year was ${f.closureGap.maxPct.toFixed(1)}% (${f.closureGap.closures} closures). Threshold = 100% − bonus − exit cost − that move: the liquidation threshold at which a loan would still have been covered after it.`
            : " No threshold is shown, because there is no listed share to measure a closure gap against."}
          {" "}Arithmetic on measurements, not a recommendation.
        </P>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={H2}>What the issuer can do on-chain</h2>
        {c ? (
          <div style={{ ...PANEL, padding: "8px 18px" }}>
            {controls.map(([label, value], i) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "9px 0", borderTop: i ? "1px solid var(--track)" : "none" }}>
                <span style={{ fontSize: 13, color: "var(--ink-soft)", flexGrow: 1 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: value.startsWith("Yes") || /%$/.test(value) && value !== "0%" ? "var(--ink)" : "var(--ink-faint)" }}>{value}</span>
              </div>
            ))}
          </div>
        ) : <P>The token&apos;s mint account could not be read just now.</P>}
        <P>Read from the mint account on Solana when this page was built. Usual for a regulated issuer; shown so a lender can see them.</P>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={H2}>History</h2>
        {f.history.length === 0 ? <P>No measurement is stored for this token yet.</P> : (
          <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
              <thead>
                <tr style={{ background: "var(--canvas)" }}>
                  <th style={TH}>Date</th><th style={TH}>US market</th>
                  <th style={{ ...TH, textAlign: "right" }}>$5k round trip</th><th style={{ ...TH, textAlign: "right" }}>Under 1% up to</th><th style={{ ...TH, textAlign: "right" }}>Under 5% up to</th>
                </tr>
              </thead>
              <tbody>
                {[...f.history].reverse().map((h) => (
                  <tr key={`${h.date}-${h.session}`} style={{ borderTop: "1px solid var(--track)" }}>
                    <td style={{ ...TD, ...NUM }}>{h.date}</td>
                    <td style={TD}>{h.session === "open" ? "open" : "shut"}</td>
                    <td style={{ ...TD, ...NUM, textAlign: "right" }}>{pct(h.cost5kPct)}</td>
                    <td style={{ ...TD, ...NUM, textAlign: "right", fontWeight: 700 }}>{h.under1Usd ? money(h.under1Usd) : "none"}</td>
                    <td style={{ ...TD, ...NUM, textAlign: "right" }}>{h.under5Usd ? money(h.under5Usd) : "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <P>Measured since {new Date(f.measuredSince).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. A measurement exists only for the day it was taken; earlier days cannot be filled in.</P>
        {f.notes.map((n) => <span key={n} style={{ fontSize: 12, color: "var(--ink-faint)" }}>{n}</span>)}
      </section>
    </main>
  );
}

export default async function LendersSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const segment = SEGMENTS.find((s) => s.slug === slug);

  if (!segment) {
    if (!isSolanaAddress(slug)) notFound();
    const file = await cachedFile(slug).catch(() => null);
    if (!file) notFound();
    return <AppFrame active="none"><TokenFile f={file} /></AppFrame>;
  }

  const sheet = await cachedSheet().catch(() => null);
  const rows = (sheet?.rows ?? []).filter((r) => segment.match(r));
  return (
    <AppFrame active="none">
      <main style={MAIN}>
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Eyebrow>For lenders · the collateral sheet</Eyebrow>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>{segment.label}</h1>
          <P>{segment.blurb}</P>
          {DOWNLOADS}
        </header>
        <SegmentNav active={segment.slug} />
        {!sheet ? <P>The collateral sheet is unavailable right now.</P> : rows.length === 0 ? <P>No tokens in this group right now.</P> : (
          <>
            <Stats rows={rows} />
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SheetTable rows={rows} />
              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>All {rows.length} tokens in this group, most in-hours capacity first. A dash means not yet measured in market hours. Open a token for its full file.</span>
            </section>
          </>
        )}
      </main>
    </AppFrame>
  );
}
