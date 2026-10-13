// Landing — ported from LandingDesktop / LandingMobile on the canvas. Tagline, one line, two buttons
// (flow map), the stock cluster, and one company's two tokens measured live.
//
// The second card used to claim TSLAon could not be left. That came from quoting pools alone: it
// leaves for under half a percent through a market maker. Both cards now say only what is measured,
// live, on the better of Jupiter's two routes.

import { unstable_cache } from "next/cache";
import Link from "next/link";

import { CompanyLogoStatic } from "@/components/trova/logo-static";
import { BrowseMarkets, ConnectedRedirect, HowItWorksLink, LandingConnect } from "@/components/trova/landing-bits";
import { buildAssetDetail } from "@/lib/asset";
import { cachedSheet } from "@/lib/collateral-cache";
import { count, usd } from "@/lib/format";
import { getMonitoringStats } from "@/lib/history";
import { exitCost } from "@/lib/jupiter";
import { getCompanyLogos } from "@/lib/logos";
import type { AssetVariantView, Rating } from "@/lib/types";

export const revalidate = 300;

const PAIR = {
  assetId: "spacex",
  good: { symbol: "SPCX", mint: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb" },
  thin: { symbol: "SPACEX", mint: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh" },
} as const;

/** What holding the token gives you, in a few words, from its live instrument class and mint. */
function owns(v: AssetVariantView): string {
  const cls = v.score.instrument.class;
  const right = cls === "direct-share" ? "Redeems for the real share"
    : cls === "backed-tracker" ? "Redeems for the share's cash value"
    : cls === "pre-ipo-exposure" ? "No redemption: exposure through an SPV"
    : "No redemption path reported";
  const fee = v.controls?.transferFeeBps ?? 0;
  return fee > 0 ? `${right}, and a ${(fee / 100).toFixed(fee % 100 === 0 ? 0 : 2)}% fee on every transfer` : right;
}

const CLUSTER: [string, string][] = [["tesla", "Tesla"], ["spacex", "SpaceX"], ["nvidia", "NVIDIA"], ["microsoft", "Microsoft"], ["apple", "Apple"], ["gold", "Gold"]];

const landingData = unstable_cache(async () => {
  // The PAIR is fixed; every number on the cards is live. SpaceX, because its two tokens differ in what
  // you own — one redeems for the real share, the other is SPV exposure with no redemption and a fee
  // on every transfer — and that does not change with the hour. Tesla's pair (TSLAx / TSLAon) rested
  // on exit cost alone and stopped saying anything once exit was measured on the right route. A pair
  // chosen from stored measurements was tried on 2026-10-12 and picked MU against MUx, grade D beside
  // a 0.28% exit: what a thin token costs to leave changes by the hour (pickContrastPair, lib/exit-store.ts).
  const assetId = PAIR.assetId;
  const [tesla, stats] = await Promise.all([
    buildAssetDetail(assetId).catch(() => null),
    getMonitoringStats(7).catch(() => null),
  ]);
  const good = tesla?.variants.find((v) => v.mint === PAIR.good.mint) ?? tesla?.variants.find((v) => v.symbol === PAIR.good.symbol) ?? null;
  const thin = tesla?.variants.find((v) => v.mint === PAIR.thin.mint) ?? tesla?.variants.find((v) => v.symbol === PAIR.thin.symbol) ?? null;
  const [goodTrip, thinTrip] = await Promise.all([
    good ? exitCost(good.mint, 500).catch(() => null) : null,
    thin ? exitCost(thin.mint, 500).catch(() => null) : null,
  ]);
  return {
    good, thin, goodTrip, thinTrip,
    assetId,
    name: tesla?.asset.name ?? "Tesla",
    teslaLogo: tesla?.asset.logoUrl ?? null,
    tracked: stats?.variantsTracked ?? null,
  };
}, ["landing-v4"], { revalidate: 300 });

// Company logos, cached apart from the rest so a failed read is never kept: unstable_cache does not
// store a thrown error, and an empty map is thrown. It MUST go through unstable_cache. This page is
// prerendered, and tokens.xyz is fetched with `cache: "no-store"`; called directly, that fetch makes
// Next throw its dynamic-rendering signal, our own catch swallowed it, and the page was built with no
// logos at all — every company drawn as a lettered disc, on the live site from 25 Sep to 12 Oct.
const landingLogos = unstable_cache(async () => {
  const map = await getCompanyLogos();
  if (map.size === 0) throw new Error("no company logos");
  return [...map];
}, ["landing-logos-v1"], { revalidate: 300 });

const D = { fontFamily: "var(--font-display), system-ui" } as const;
const N = { ...D, fontVariantNumeric: "tabular-nums" } as const;

function pill(g: Rating, score: number | null, onWhite: boolean, size = 16) {
  const c = g === "A" ? ["var(--grade-a)", "var(--grade-a-bg)"] : g === "B" ? ["var(--grade-b)", "var(--grade-b-bg)"] : g === "C" ? ["var(--grade-c)", "var(--grade-c-bg)"] : ["var(--grade-d)", "var(--grade-d-bg)"];
  return <span style={{ ...N, display: "inline-flex", gap: 6, borderRadius: 999, padding: size >= 16 ? "6px 14px" : "4px 11px", fontSize: size, fontWeight: 700, color: c[0], background: onWhite ? "var(--surface)" : c[1] }}>{g}{score != null && <span>{score}</span>}</span>;
}

function Bars({ own, exit, onTint }: { own: number; exit: number; onTint: boolean }) {
  const fill = (v: number) => (v >= 65 ? "var(--grade-a)" : v >= 50 ? "var(--grade-c)" : "var(--danger)");
  return (
    <div style={{ display: "flex", gap: 22, marginTop: 15 }}>
      {([["Ownership", own], ["Exit", exit]] as const).map(([l, v]) => (
        <div key={l} style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 12, fontWeight: 600 }}>{l}</span><span style={{ flexGrow: 1 }} /><span style={{ ...N, fontSize: 12, fontWeight: 700 }}>{v}</span></div>
          <div style={{ height: 6, borderRadius: 999, background: onTint ? "var(--surface)" : "var(--track)", overflow: "hidden" }}><div style={{ width: `${v}%`, height: 6, background: fill(v) }} /></div>
        </div>
      ))}
    </div>
  );
}

// The second card follows the live rating: red when it can't be left (not tradable, grade D, or
// ≥10% lost on the way back out), amber when it is merely the weaker token.
function TokenCard({ v, logo, line, bad, warn, compact, name, id, mm }: { v: AssetVariantView; logo: string | null; line: React.ReactNode; bad: boolean; warn?: boolean; compact?: boolean; name: string; id: string; mm?: boolean }) {
  const tint = bad ? { bg: "var(--danger-soft)", border: "1px solid var(--danger-line)", sub: "var(--danger-deep)", rule: "var(--danger-line)" }
    : warn ? { bg: "var(--warn-soft)", border: "1px solid var(--grade-c-bg)", sub: "var(--ink-soft)", rule: "var(--grade-c-bg)" }
    : { bg: "var(--surface)", border: "2px solid var(--grade-a)", sub: "var(--ink-faint)", rule: "var(--track)" };
  return (
    <div style={{ background: tint.bg, border: tint.border, borderRadius: 16, padding: compact ? "14px 15px" : "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CompanyLogoStatic src={logo} name={name} id={id} size={40} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ ...D, fontSize: compact ? 15 : 17, fontWeight: 600 }}>{v.symbol}</span>
            {v.score.instrument.speculative && <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
            {bad && compact && <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "var(--danger)", background: "var(--danger-bg)" }}>At risk</span>}
            {warn && compact && !v.score.instrument.speculative && <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "var(--grade-c)", background: "var(--surface)" }}>Weaker</span>}
          </div>
          <span style={{ fontSize: 11, color: tint.sub }}>
            {v.issuer} · {mm ? "filled by market makers" : `${usd(v.liquidityUsd, { compact: true })} liquidity`}{compact ? "" : ` · ${count(v.holders)} holders`}
          </span>
        </div>
        <span style={{ flexGrow: 1 }} />
        {pill(v.score.grade, v.score.score, bad || !!warn, compact ? 13 : 16)}
      </div>
      {!compact && <Bars own={v.score.ownership.score} exit={v.score.exit.score} onTint={bad || !!warn} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: compact ? 10 : 14, paddingTop: compact ? 0 : 12, borderTop: compact ? "none" : `1px solid ${tint.rule}` }}>
        {line}
      </div>
    </div>
  );
}

function Cluster({ items, more, size }: { items: { id: string; name: string; logo: string | null }[]; more: number | null; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {items.map((c, i) => (
        <span key={c.id} style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.29), borderRadius: 999, border: "3px solid var(--surface)", display: "flex" }}>
          <CompanyLogoStatic src={c.logo} name={c.name} id={c.id} size={size - 6} />
        </span>
      ))}
      {more != null && more > 0 && (
        <span style={{ ...D, marginLeft: -Math.round(size * 0.29), display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 999, background: "var(--track)", color: "var(--ink-soft)", fontSize: Math.round(size * 0.25), fontWeight: 700, border: "3px solid var(--surface)", boxSizing: "border-box" }}>
          +{more}
        </span>
      )}
    </div>
  );
}

/**
 * The second thing Trova is, introduced under the fold: the same measurements, read by someone lending
 * against these tokens rather than holding them. The three figures are counted live from the sheet.
 */
function LendersBand({ stats, compact }: { stats: { measured: number; million: number; shut: number } | null; compact?: boolean }) {
  const figures: [string, string][] = stats ? [
    [String(stats.measured), "tokens measured in US market hours"],
    [String(stats.million), "leave $1M or more for under 1%"],
    [String(stats.shut), "do not trade when the market is shut"],
  ] : [];
  return (
    <section style={{ borderTop: "1px solid var(--hairline)", padding: compact ? "26px 0 6px" : "44px 56px 56px", marginTop: compact ? 26 : 0, display: "flex", flexDirection: compact ? "column" : "row", gap: compact ? 18 : 60, alignItems: compact ? "stretch" : "flex-start" }}>
      <div style={{ width: compact ? "auto" : 560, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>For lenders and risk teams</span>
        <h2 style={{ margin: "14px 0 0", ...D, fontSize: compact ? 26 : 36, lineHeight: 1.08, fontWeight: 700, letterSpacing: compact ? -0.6 : -1 }}>How much of it can actually be sold</h2>
        <p style={{ margin: "14px 0 0", fontSize: compact ? 14 : 15, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: "50ch" }}>
          Trova quotes a real round trip in every tokenized stock on Solana, from $5,000 up to $25 million, in US market hours and outside them, and reads what the issuer can do to the token on-chain. The collateral sheet puts it in one table: how much leaves for under 1%, what a liquidator could sell inside the bonus, and which tokens stop trading when the market shuts.
        </p>
        <div style={{ marginTop: 20 }}>
          <Link href="/lenders" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: compact ? 50 : 52, width: compact ? "100%" : "auto", padding: "0 24px", borderRadius: 14, fontSize: 15, fontWeight: 700, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none", boxSizing: "border-box" }}>Open the collateral sheet</Link>
        </div>
      </div>
      {figures.length > 0 && (
        <div style={{ flexGrow: 1, display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
          {figures.map(([value, label]) => (
            <div key={label} style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: compact ? "14px 16px" : "18px 20px", display: "flex", flexDirection: compact ? "row" : "column", alignItems: compact ? "baseline" : "flex-start", gap: compact ? 10 : 6 }}>
              <span style={{ ...N, fontSize: compact ? 22 : 34, fontWeight: 700 }}>{value}</span>
              <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const lockIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
const logoMark = (s: number) => (
  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: s, height: s, borderRadius: s * 0.3, background: "var(--action)" }}>
    <svg width={s * 0.53} height={s * 0.53} viewBox="0 0 24 24" fill="none" stroke="var(--action-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
  </span>
);

export default async function Landing() {
  // Logos first: the asset build inside landingData reads the same in-memory logo map, and should
  // find it filled.
  const logos = new Map(await landingLogos().catch(() => [] as [string, string][]));
  const cached = await landingData();
  const d = {
    ...cached,
    // The fresh company logo first: the cached one may be a fallback captured during an outage.
    teslaLogo: logos.get(cached.assetId) ?? cached.teslaLogo ?? null,
    cluster: CLUSTER.map(([id, name]) => ({ id, name, logo: logos.get(id) ?? null })),
  };
  const back = (t: typeof d.goodTrip) => (t && t.status === "ok" && t.roundTripPct != null ? 500 * (1 - t.roundTripPct / 100) : null);
  const goodPct = d.goodTrip?.status === "ok" ? d.goodTrip.roundTripPct : null;
  const thinBack = back(d.thinTrip);
  // Pool depth says nothing about a token a market maker fills, so those cards do not quote it.
  const goodMm = d.goodTrip?.liquidity === "market-maker";
  const thinMm = d.thinTrip?.liquidity === "market-maker";
  const more = d.tracked != null ? d.tracked - d.cluster.length : null;
  const sheet = await cachedSheet().catch(() => null);
  const lenderStats = sheet ? {
    measured: sheet.measuredInHours,
    million: sheet.rows.filter((r) => (r.open?.under1Usd ?? 0) >= 1_000_000).length,
    shut: sheet.rows.filter((r) => r.closed?.status5k === "market-closed").length,
  } : null;

  const goodLine = goodPct != null && d.good
    ? <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{owns(d.good)}. Costs <b style={{ color: "var(--grade-a)" }}>{goodPct.toFixed(2)}%</b> to get in and back out at $500.</span>
    : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{d.good?.explanation?.headline}</span>;
  const thinPct = d.thinTrip?.status === "ok" ? d.thinTrip.roundTripPct : null;
  const thinBad = !!d.thin && (d.thinTrip?.status === "no-route" || (thinPct ?? 0) >= 10 || (thinPct == null && d.thinTrip?.status !== "market-closed" && !d.thin.score.routable));
  const thinTone = thinBad ? "var(--danger)" : "var(--grade-c)";
  const thinLine = thinBad && thinBack != null && d.thin
    ? <span style={{ fontSize: 12, fontWeight: 700, color: thinTone }}>{owns(d.thin)}. Buy $500 and sell it straight back: {usd(thinBack)} returns.</span>
    : !thinBad && thinPct != null && d.thin
      ? <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{owns(d.thin)}. Costs <b style={{ color: thinTone }}>{thinPct.toFixed(2)}%</b> to get in and back out at $500.</span>
      : <span style={{ fontSize: 12, fontWeight: 700, color: thinTone }}>{d.thin?.explanation?.headline}</span>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface)", color: "var(--ink)" }}>
      <ConnectedRedirect />

      {/* ---------------- desktop ---------------- */}
      <div className="hidden lg:flex" style={{ flexDirection: "column", maxWidth: 1440, margin: "0 auto", minHeight: "100vh" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "26px 56px" }}>
          {logoMark(40)}
          <span style={{ ...D, fontSize: 26, fontWeight: 700, letterSpacing: -0.8 }}>Trova</span>
          <span style={{ flexGrow: 1 }} />
          <Link href="/markets" style={{ fontSize: 14, fontWeight: 600, textDecoration: "none", color: "var(--ink)", padding: "12px 18px" }}>Markets</Link>
          <Link href="/lenders" style={{ fontSize: 14, fontWeight: 600, textDecoration: "none", color: "var(--ink)", padding: "12px 18px" }}>For lenders</Link>
          <HowItWorksLink />
          <LandingConnect />
        </header>

        <div style={{ flexGrow: 1, display: "flex", gap: 60, padding: "40px 56px 44px" }}>
          <div style={{ width: 560, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <span style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>Ownership &amp; Exit ratings for tokenized stocks</span>
            <h1 style={{ margin: "18px 0 0", ...D, fontSize: 62, lineHeight: 1.02, fontWeight: 700, letterSpacing: -2 }}>Know what<br />you own</h1>
            <p style={{ margin: "22px 0 0", fontSize: 16, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: "46ch" }}>
              The same stock exists on Solana as several tokens that look identical on a chart. Some redeem for the real share, some pay its cash value, some give you no rights at all — and what you get back when you sell depends on the token, the size and the hour. Trova rates what you&apos;d own and whether you can get out.
            </p>
            <div style={{ marginTop: 30 }}><Cluster items={d.cluster} more={more} size={56} /></div>
            <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
              <LandingConnect size="hero" />
              <BrowseMarkets />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
              {lockIcon}<span style={{ fontSize: 12, color: "var(--ink-faint)" }}>We only read your public address. You sign nothing to look.</span>
            </div>
          </div>

          {d.good && d.thin && (
            <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>{d.name}, right now</span>
              <TokenCard v={d.good} logo={d.teslaLogo} line={goodLine} bad={false} name={d.name} id={d.assetId} mm={goodMm} />
              <TokenCard v={d.thin} logo={d.teslaLogo} line={thinLine} bad={thinBad} warn={!thinBad} name={d.name} id={d.assetId} mm={thinMm} />
            </div>
          )}
        </div>
        <LendersBand stats={lenderStats} />
      </div>

      {/* ---------------- mobile ---------------- */}
      <div className="flex lg:hidden" style={{ flexDirection: "column", minHeight: "100vh", padding: "26px 22px 24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {logoMark(42)}
          <span style={{ ...D, fontSize: 25, fontWeight: 700, letterSpacing: -0.8 }}>Trova</span>
        </div>
        <div style={{ marginTop: 26 }}><Cluster items={d.cluster} more={more} size={52} /></div>
        <h1 style={{ margin: "22px 0 0", ...D, fontSize: 42, lineHeight: 1.03, fontWeight: 700, letterSpacing: -1.5 }}>Know what<br />you own</h1>
        <p style={{ margin: "13px 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--ink-soft)" }}>The same stock exists on Solana as several tokens with very different rights. Trova rates what you&apos;d own, and whether you can get out.</p>
        {d.good && d.thin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            <TokenCard compact name={d.name} id={d.assetId} v={d.good} logo={d.teslaLogo} bad={false} line={<span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{goodMm ? "Market-maker filled" : `${usd(d.good.liquidityUsd, { compact: true })} depth`}{goodPct != null ? ` · ${goodPct.toFixed(2)}% to leave` : ""}</span>} />
            <TokenCard compact name={d.name} id={d.assetId} v={d.thin} logo={d.teslaLogo} bad={thinBad} warn={!thinBad} line={<span style={{ fontSize: 11, color: thinBad ? "var(--danger-deep)" : "var(--ink-soft)", fontWeight: 600 }}>{thinMm ? "Market-maker filled" : `${usd(d.thin.liquidityUsd, { compact: true })} depth`}{thinBack != null ? ` · $500 in, ${usd(thinBack)} out` : ""}</span>} />
            <span style={{ fontSize: 11, color: "var(--ink-faint)", padding: "3px 4px 0" }}>Same company. Two different tokens.</span>
          </div>
        )}
        <span style={{ flexGrow: 1, minHeight: 24 }} />
        <LandingConnect size="lg" />
        <div style={{ marginTop: 10 }}><BrowseMarkets full /></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 }}>
          {lockIcon}<span style={{ fontSize: 11, color: "var(--ink-faint)" }}>We only read your public address</span>
        </div>
        <LendersBand stats={lenderStats} compact />
      </div>
    </div>
  );
}
