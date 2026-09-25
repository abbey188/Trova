// Landing — ported from LandingDesktop / LandingMobile on the canvas. Tagline, one line, two buttons
// (flow map), the stock cluster, and Tesla's two tokens measured live.

import { unstable_cache } from "next/cache";
import Link from "next/link";

import { CompanyLogoStatic } from "@/components/trova/logo-static";
import { BrowseMarkets, ConnectedRedirect, HowItWorksLink, LandingConnect } from "@/components/trova/landing-bits";
import { buildAssetDetail } from "@/lib/asset";
import { count, usd } from "@/lib/format";
import { getMonitoringStats } from "@/lib/history";
import { exitCost } from "@/lib/jupiter";
import { getCompanyLogos } from "@/lib/logos";
import type { AssetVariantView, Rating } from "@/lib/types";

export const revalidate = 300;

const CLUSTER: [string, string][] = [["tesla", "Tesla"], ["spacex", "SpaceX"], ["nvidia", "NVIDIA"], ["microsoft", "Microsoft"], ["apple", "Apple"], ["gold", "Gold"]];

const landingData = unstable_cache(async () => {
  const [tesla, stats] = await Promise.all([
    buildAssetDetail("tesla").catch(() => null),
    getMonitoringStats(7).catch(() => null),
  ]);
  const good = tesla?.variants.find((v) => v.symbol === "TSLAx") ?? null;
  const thin = tesla?.variants.find((v) => v.symbol === "TSLAon") ?? null;
  const [goodTrip, thinTrip] = await Promise.all([
    good ? exitCost(good.mint, 500).catch(() => null) : null,
    thin ? exitCost(thin.mint, 500).catch(() => null) : null,
  ]);
  return {
    good, thin, goodTrip, thinTrip,
    teslaLogo: tesla?.asset.logoUrl ?? null,
    tracked: stats?.variantsTracked ?? null,
  };
}, ["landing-v2"], { revalidate: 300 });

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

function TokenCard({ v, logo, line, bad, compact }: { v: AssetVariantView; logo: string | null; line: React.ReactNode; bad: boolean; compact?: boolean }) {
  return (
    <div style={{ background: bad ? "var(--danger-soft)" : "var(--surface)", border: bad ? "1px solid var(--danger-line)" : "2px solid var(--grade-a)", borderRadius: 16, padding: compact ? "14px 15px" : "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CompanyLogoStatic src={logo} name="Tesla" id="tesla" size={40} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ ...D, fontSize: compact ? 15 : 17, fontWeight: 600 }}>{v.symbol}</span>
            {bad && compact && <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "var(--danger)", background: "var(--danger-bg)" }}>At risk</span>}
          </div>
          <span style={{ fontSize: 11, color: bad ? "var(--danger-deep)" : "var(--ink-faint)" }}>
            {v.issuer} · {usd(v.liquidityUsd, { compact: true })} liquidity{compact ? "" : ` · ${count(v.holders)} holders`}
          </span>
        </div>
        <span style={{ flexGrow: 1 }} />
        {pill(v.score.grade, v.score.score, bad, compact ? 13 : 16)}
      </div>
      {!compact && <Bars own={v.score.ownership.score} exit={v.score.exit.score} onTint={bad} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: compact ? 10 : 14, paddingTop: compact ? 0 : 12, borderTop: compact ? "none" : `1px solid ${bad ? "var(--danger-line)" : "var(--track)"}` }}>
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

const lockIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
const logoMark = (s: number) => (
  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: s, height: s, borderRadius: s * 0.3, background: "var(--action)" }}>
    <svg width={s * 0.53} height={s * 0.53} viewBox="0 0 24 24" fill="none" stroke="var(--action-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
  </span>
);

export default async function Landing() {
  // Logos stay out of the 5-minute page cache: they have their own, which never keeps a failure.
  const [cached, logos] = await Promise.all([landingData(), getCompanyLogos().catch(() => new Map<string, string>())]);
  const d = {
    ...cached,
    teslaLogo: cached.teslaLogo ?? logos.get("tesla") ?? null,
    cluster: CLUSTER.map(([id, name]) => ({ id, name, logo: logos.get(id) ?? null })),
  };
  const back = (t: typeof d.goodTrip) => (t && t.status === "ok" && t.roundTripPct != null ? 500 * (1 - t.roundTripPct / 100) : null);
  const goodPct = d.goodTrip?.status === "ok" ? d.goodTrip.roundTripPct : null;
  const thinBack = back(d.thinTrip);
  const more = d.tracked != null ? d.tracked - d.cluster.length : null;

  const goodLine = goodPct != null
    ? <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Costs <b style={{ color: "var(--grade-a)" }}>{goodPct.toFixed(2)}%</b> to get in and back out at $500</span>
    : <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{d.good?.explanation?.headline}</span>;
  const thinLine = thinBack != null
    ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>Buy $500 and sell it straight back: {usd(thinBack)} returns. Same company, same chart.</span>
    : <span style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>{d.thin?.explanation?.headline}</span>;

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
          <HowItWorksLink />
          <LandingConnect />
        </header>

        <div style={{ flexGrow: 1, display: "flex", gap: 60, padding: "40px 56px 44px" }}>
          <div style={{ width: 560, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <span style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>Tokenized stocks on Solana</span>
            <h1 style={{ margin: "18px 0 0", ...D, fontSize: 62, lineHeight: 1.02, fontWeight: 700, letterSpacing: -2 }}>Know what<br />you own</h1>
            <p style={{ margin: "22px 0 0", fontSize: 16, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: "46ch" }}>
              The same stock exists as several tokens on Solana. They look identical on a price chart. One is swappable for the real share, one owns nothing, and one cannot be sold at any size.
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
              <span style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>Tesla, right now</span>
              <TokenCard v={d.good} logo={d.teslaLogo} line={goodLine} bad={false} />
              <TokenCard v={d.thin} logo={d.teslaLogo} line={thinLine} bad />
            </div>
          )}
        </div>
      </div>

      {/* ---------------- mobile ---------------- */}
      <div className="flex lg:hidden" style={{ flexDirection: "column", minHeight: "100vh", padding: "26px 22px 24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          {logoMark(42)}
          <span style={{ ...D, fontSize: 25, fontWeight: 700, letterSpacing: -0.8 }}>Trova</span>
        </div>
        <div style={{ marginTop: 26 }}><Cluster items={d.cluster} more={more} size={52} /></div>
        <h1 style={{ margin: "22px 0 0", ...D, fontSize: 42, lineHeight: 1.03, fontWeight: 700, letterSpacing: -1.5 }}>Know what<br />you own</h1>
        <p style={{ margin: "13px 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--ink-soft)" }}>The same stock exists as several tokens on Solana. Only some of them can be sold.</p>
        {d.good && d.thin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            <TokenCard compact v={d.good} logo={d.teslaLogo} bad={false} line={<span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{usd(d.good.liquidityUsd, { compact: true })} depth{goodPct != null ? ` · ${goodPct.toFixed(2)}% to leave` : ""}</span>} />
            <TokenCard compact v={d.thin} logo={d.teslaLogo} bad line={<span style={{ fontSize: 11, color: "var(--danger-deep)", fontWeight: 600 }}>{usd(d.thin.liquidityUsd, { compact: true })} depth{thinBack != null ? ` · $500 in, ${usd(thinBack)} out` : ""}</span>} />
            <span style={{ fontSize: 11, color: "var(--ink-faint)", padding: "3px 4px 0" }}>Same company. Same price on the chart.</span>
          </div>
        )}
        <span style={{ flexGrow: 1, minHeight: 24 }} />
        <LandingConnect size="lg" />
        <div style={{ marginTop: 10 }}><BrowseMarkets full /></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 }}>
          {lockIcon}<span style={{ fontSize: 11, color: "var(--ink-faint)" }}>We only read your public address</span>
        </div>
      </div>
    </div>
  );
}
