"use client";

// Asset — ported from AssetDesktop / AssetMobile (a listed company), AssetSingleDesktop (the only
// token) and AssetPrivateDesktop (a private company). Flow map: logo, price, real chart 1D–1Y, then
// ONE card — the sound token — with the others folded behind a count.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { CompareButton, HeldCard } from "@/components/trova/asset-held";
import { HelpButton } from "@/components/trova/frame";
import { CompanyLogo, DISPLAY, GradePill, Icon, Label, NUM, Panel, PillarBar, ScoreRing, WhyButton } from "@/components/trova/kit";
import { PriceChart, RangeTabs, useRangeSeries, type RangeKey } from "@/components/trova/price-chart";
import { isChange, signalMeta, signalTitle, signalWhy } from "@/components/trova/signal-line";
import { SellTrigger, TradeTrigger } from "@/components/trova/trade-trigger";
import { swapFromHolding, toOption, type SwapFrom, type TokenOption } from "@/components/trova/trade-sheet";
import { useWalletAddress } from "@/components/trova/wallet";
import { api } from "@/lib/client";
import { count, usd } from "@/lib/format";
import type { AssetDetail, AssetVariantView, MarketRow, PortfolioSummary } from "@/lib/types";


const tierLabel = (t: string) => `Tier ${t.replace(/\D/g, "") || "3"}`;
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`);

// ---------------------------------------------------------------------------------------------

export function AssetScreen({ detail }: { detail: AssetDetail }) {
  const { asset, variants, best, privateMark } = detail;
  const shown = variants.filter((v) => !v.score.hidden);
  const top = shown.find((v) => v.mint === best?.mint) ?? shown[0];
  const others = shown.filter((v) => v.mint !== top?.mint);
  const priv = !!privateMark || shown.every((v) => v.score.instrument.speculative);
  const options = shown.map(toOption);
  const swapFrom = useSwapFrom(asset.assetId, top);
  const sellFrom = useSellFrom(asset.assetId);
  const held = useHeld(asset.assetId, shown);
  // The token you hold, when it isn't the soundest one — the page leads with it.
  const heldWeaker = held && top && held.variant.mint !== top.mint ? held : null;
  const holdsTop = !!held && !!top && held.variant.mint === top.mint;
  const ctx: HeldCtx = { held, heldWeaker, holdsTop, swapFrom, sellFrom };

  const actions = top ? (
    <>
      <WatchButton assetId={asset.assetId} />
      {sellFrom && <SellTrigger from={sellFrom} assetName={asset.name} assetId={asset.assetId} logoUrl={asset.logoUrl} />}
      {swapFrom && <TradeTrigger label="Swap" variant="secondary" assetName={asset.name} assetId={asset.assetId} logoUrl={asset.logoUrl} options={[toOption(top)]} defaultMint={top.mint} from={swapFrom} />}
      <TradeTrigger label={`Buy${priv ? ` ${top.symbol}` : ""}`} assetName={asset.name} assetId={asset.assetId} logoUrl={asset.logoUrl} options={options} defaultMint={top.mint} />
    </>
  ) : null;

  return (
    <>
      <header className="hidden lg:flex" style={{ alignItems: "center", gap: 10, padding: "12px 26px", background: "var(--surface)", borderBottom: "1px solid var(--hairline)", position: "sticky", top: 0, zIndex: 30 }}>
        <Link href="/markets" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", textDecoration: "none", padding: "7px 10px 7px 6px", borderRadius: 9 }}>{Icon.back()}Markets</Link>
        <span style={{ flexGrow: 1 }} />
        {actions}
      </header>

      {priv ? <PrivateDesktop detail={detail} top={top} others={others} /> : <ListedDesktop detail={detail} top={top} others={others} ctx={ctx} />}
      <AssetMobile detail={detail} top={top} others={others} priv={priv} swapFrom={swapFrom} options={options} ctx={ctx} />
    </>
  );
}

interface HeldCtx {
  held: { variant: AssetVariantView; valueUsd: number | null; sellLossPct: number | null } | null;
  heldWeaker: HeldCtx["held"];
  holdsTop: boolean;
  swapFrom?: SwapFrom;
  sellFrom?: SwapFrom;
}

/**
 * Which of this company's tokens you hold: the connected wallet's largest position in it, or — from
 * a link on Home or Updates — the `?held=<mint>` it names (the demo portfolio has no wallet).
 */
function useHeld(assetId: string, shown: AssetVariantView[]): HeldCtx["held"] {
  const address = useWalletAddress();
  const [param, setParam] = useState<string | null>(null);
  useEffect(() => { setParam(new URLSearchParams(window.location.search).get("held")); }, []);
  const wallet = address ?? (param ? "demo" : null);
  const p = useQuery({ queryKey: ["portfolio", wallet], queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${wallet}`), enabled: !!wallet, staleTime: 60_000 });
  const mine = (p.data?.holdings ?? []).filter((h) => h.asset.assetId === assetId && h.valueUsd > 0).sort((a, b) => b.valueUsd - a.valueUsd);
  const h = (param ? mine.find((x) => x.variant.mint === param) : null) ?? (address ? mine[0] : null);
  const mint = h?.variant.mint ?? param;
  const variant = mint ? shown.find((v) => v.mint === mint) : undefined;
  if (!variant) return null;
  return { variant, valueUsd: h?.valueUsd ?? null, sellLossPct: h?.sellNow?.status === "ok" ? h.sellNow.lossPct ?? null : null };
}

/** The connected wallet's largest position in any token of this company — what "Sell" sells. */
function useSellFrom(assetId: string): SwapFrom | undefined {
  const address = useWalletAddress();
  const p = useQuery({ queryKey: ["portfolio", address], queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${address}`), enabled: !!address, staleTime: 60_000 });
  const h = (p.data?.holdings ?? []).filter((x) => x.asset.assetId === assetId && x.rawAmount && x.rawAmount !== "0" && x.decimals != null).sort((a, b) => b.valueUsd - a.valueUsd)[0];
  return h ? swapFromHolding(h) : undefined;
}

/** A position in a weaker token of this company that the connected wallet actually holds. */
function useSwapFrom(assetId: string, top?: AssetVariantView): SwapFrom | undefined {
  const address = useWalletAddress();
  const p = useQuery({ queryKey: ["portfolio", address], queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${address}`), enabled: !!address, staleTime: 60_000 });
  if (!top || !top.score.routable) return undefined;
  const h = p.data?.holdings.find((x) => x.asset.assetId === assetId && x.variant.mint !== top.mint && x.rawAmount && x.rawAmount !== "0" && x.decimals != null);
  return h ? swapFromHolding(h) : undefined;
}

function WatchButton({ assetId, iconOnly }: { assetId: string; iconOnly?: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["watchlist"], queryFn: () => api<{ items: MarketRow[] }>("/api/watchlist", { device: true }), retry: false, staleTime: 60_000 });
  const on = list.data?.items.some((i) => i.assetId === assetId) ?? false;
  const toggle = useMutation({
    mutationFn: () => on
      ? api(`/api/watchlist?assetId=${encodeURIComponent(assetId)}`, { method: "DELETE", device: true })
      : api("/api/watchlist", { method: "POST", device: true, body: JSON.stringify({ assetId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  if (list.isError) return null;
  if (iconOnly) {
    return (
      <button type="button" onClick={() => toggle.mutate()} aria-pressed={on} aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "none", borderRadius: 12, background: "var(--canvas)", color: on ? "var(--ink)" : "var(--ink-soft)", cursor: "pointer" }}>
        {Icon.star(17, on)}
      </button>
    );
  }
  return (
    <button type="button" onClick={() => toggle.mutate()} aria-pressed={on} disabled={toggle.isPending}
      style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 14px", border: "1px solid var(--hairline)", borderRadius: 11, background: "var(--surface)", color: on ? "var(--ink)" : "var(--ink-soft)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {Icon.star(16, on)}{on ? "Watching" : "Watchlist"}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// listed company — desktop

function TitleRow({ detail, top, price, change, changePct, rangeLabel }: { detail: AssetDetail; top?: AssetVariantView; price: number | null; change: number | null; changePct: number | null; rangeLabel: string }) {
  const { asset } = detail;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 15, flexWrap: "wrap", paddingRight: 8 }}>
      <CompanyLogo src={asset.logoUrl} name={asset.name} id={asset.assetId} size={54} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ ...DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: -0.5 }}>{asset.name}</span>
          {asset.symbol && <span style={{ display: "inline-flex", borderRadius: 7, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", background: "var(--chip)" }}>{asset.symbol}</span>}
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{asset.assetClass === "etf" ? "ETF" : asset.assetClass === "metal" ? "Metal" : "Stock"}</span>
      </div>
      <span style={{ flexGrow: 1 }} />
      {/* Both prices hang from the same top line, so their labels align whatever sits beneath. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink-faint)" }}>On-chain{top ? ` · ${top.symbol}` : ""}</span>
        <span style={{ ...NUM, fontSize: 30, fontWeight: 700, letterSpacing: -0.9 }}>{price != null ? usd(price) : "—"}</span>
        {change != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: change >= 0 ? "var(--grade-a)" : "var(--danger)" }}>
            {change >= 0 ? Icon.up() : Icon.down()}{usd(Math.abs(change))} · {Math.abs(changePct ?? 0).toFixed(2)}% <span style={{ color: "var(--ink-faint)", fontWeight: 500 }}>· {rangeLabel}</span>
          </span>
        )}
        {top?.priceBasis === "trades" && top.listedPriceUsd != null && (
          <span style={{ fontSize: 11, color: "var(--grade-c)", fontWeight: 600 }}>where it trades · issuer lists {usd(top.listedPriceUsd)}</span>
        )}
      </div>
      {detail.reference && top?.gapPercent != null && <MarketPriceBlock detail={detail} />}
      </div>
    </div>
  );
}

/** The real share (or ounce) off-chain, beside the on-chain price. Display only, never scored. */
function MarketPriceBlock({ detail, compact }: { detail: AssetDetail; compact?: boolean }) {
  const r = detail.reference!;
  // Only shares keep exchange hours; spot metal trades around the clock.
  const status = r.basis !== "share" || r.marketOpen == null ? null : r.marketOpen ? "US market open" : "US market closed · on-chain open";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: compact ? 0 : 22, borderLeft: compact ? "none" : "1px solid var(--hairline)", alignSelf: "stretch" }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink-faint)" }}>{r.basis === "ounce" ? "Spot · per ounce" : `On the exchange · ${r.ticker}`}</span>
      <span style={{ ...NUM, fontSize: compact ? 20 : 30, fontWeight: 700, letterSpacing: compact ? -0.4 : -0.9, color: "var(--ink-soft)" }}>{usd(r.priceUsd)}</span>
      {status && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: r.marketOpen ? "var(--grade-a)" : "var(--neutral-bar)" }} />{status}
        </span>
      )}
    </div>
  );
}

const RANGE_WORDS: Record<RangeKey, string> = { "1D": "today", "1W": "7 days", "1M": "30 days", "3M": "90 days", "1Y": "1 year" };

function useChart(detail: AssetDetail) {
  const [range, setRange] = useState<RangeKey>("3M");
  const series = useRangeSeries(detail.priceHistory, range);
  const first = series.token[0]?.v ?? null;
  const last = series.token.at(-1)?.v ?? null;
  const change = first != null && last != null ? last - first : null;
  const changePct = change != null && first ? (change / first) * 100 : null;
  const available = (r: RangeKey) => {
    const h = detail.priceHistory;
    if (!h) return false;
    if (r === "1D") return (h.intraday?.token.length ?? 0) > 1;
    const n = h.daily.token.length;
    return r === "1W" ? n > 1 : r === "1M" ? n > 7 : r === "3M" ? n > 30 : n > 90;
  };
  return { range, setRange, series, change, changePct, available };
}

function ListedDesktop({ detail, top, others, ctx }: { detail: AssetDetail; top?: AssetVariantView; others: AssetVariantView[]; ctx: HeldCtx }) {
  const c = useChart(detail);
  const price = top?.priceUsd ?? null;
  const ref = detail.priceHistory?.daily.reference?.ticker;
  const all = top ? [top, ...others] : others;
  return (
    <main className="hidden lg:flex" style={{ padding: "20px 26px 24px", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <TitleRow detail={detail} top={top} price={price} change={c.change} changePct={c.changePct} rangeLabel={RANGE_WORDS[c.range]} />
        <Panel style={{ padding: "16px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flexGrow: 1 }} />
            <RangeTabs value={c.range} onChange={c.setRange} available={c.available} />
          </div>
          <div style={{ marginTop: 8 }}>
            <PriceChart token={c.series.token} reference={c.series.ref} tokenLabel={top ? `${top.symbol} · on-chain` : undefined} refLabel={ref ? `${ref} · on the exchange` : undefined} />
          </div>
        </Panel>
        <StatGrid detail={detail} top={top} />
        <AboutCard detail={detail} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
          {top && <BenefitsCard top={top} />}
          <Changes detail={detail} />
        </div>
      </div>
      <aside style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {ctx.heldWeaker && top && <HeldCard detail={detail} held={ctx.heldWeaker} top={top} swapFrom={ctx.swapFrom} />}
        {top && <TopTokenCard detail={detail} top={top} only={others.length === 0} holds={ctx.holdsTop} alternative={!!ctx.heldWeaker} />}
        {others.length > 0 ? <CompareButton detail={detail} all={all} heldMint={ctx.held?.variant.mint} /> : <NothingToCompare name={detail.asset.name} />}
        {top && <ExitCard mint={top.mint} />}
      </aside>
    </main>
  );
}

function MiniLine({ values }: { values: number[] }) {
  const v = values.filter((n) => Number.isFinite(n));
  if (v.length < 2) return <div style={{ height: 34, marginTop: 8 }} />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * 100).toFixed(1)},${(32 - ((y - min) / span) * 30).toFixed(1)}`).join(" ");
  const up = v[v.length - 1] >= v[0];
  return (
    <svg width="100%" height="34" viewBox="0 0 100 34" preserveAspectRatio="none" style={{ display: "block", marginTop: 8 }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "var(--grade-a)" : "var(--danger)"} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function VolumeBars({ values }: { values: number[] }) {
  if (values.length < 2) return <div style={{ height: 34, marginTop: 8 }} />;
  const max = Math.max(...values) || 1;
  const sorted = [...values].sort((a, b) => b - a);
  const hot = sorted[Math.min(2, sorted.length - 1)];
  const w = 122 / values.length;
  return (
    <svg width="100%" height="34" viewBox="0 0 122 34" preserveAspectRatio="none" style={{ display: "block", marginTop: 8 }} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 32);
        return <rect key={i} x={i * w} y={34 - h} width={Math.max(1, w - 1.4)} height={h} rx="1" fill={v >= hot ? "var(--grade-a)" : "var(--neutral-bar)"} />;
      })}
    </svg>
  );
}

function StatGrid({ detail, top, compact }: { detail: AssetDetail; top?: AssetVariantView; compact?: boolean }) {
  const pts = top?.history?.points ?? [];
  const w = top?.history?.trend7d;
  const vols = (detail.priceHistory?.daily.token ?? []).slice(-30).map((c) => c.volume);
  const ranges = detail.priceHistory?.ranges;
  const price = top?.priceUsd ?? null;
  const card = (children: ReactNode) => <Panel style={{ padding: "14px 16px", borderRadius: 14, minWidth: compact ? 152 : 0, flexShrink: 0 }}>{children}</Panel>;
  const trend = (text: string | null, up: boolean) => text && <span style={{ display: "block", fontSize: 10, color: up ? "var(--grade-a)" : "var(--danger)", fontWeight: 600, marginTop: 5 }}>{text}</span>;
  const marker = (lo: number, hi: number) => (price == null || hi <= lo ? 50 : Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100)));
  return (
    <div style={compact ? { display: "flex", gap: 9, overflowX: "auto", paddingBottom: 2 } : { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
      {card(<>
        <span style={{ fontSize: 10, color: "var(--ink-faint)", fontWeight: 600 }}>Liquidity</span>
        <div style={{ ...NUM, fontSize: compact ? 18 : 20, fontWeight: 700, marginTop: 5 }}>{usd(top?.liquidityUsd, { compact: true })}</div>
        <MiniLine values={pts.map((p) => p.liquidityUsd ?? NaN)} />
        {trend(w?.liquidityChangePct != null ? `${pct(w.liquidityChangePct)} · 7 days` : null, (w?.liquidityChangePct ?? 0) >= 0)}
      </>)}
      {card(<>
        <span style={{ fontSize: 10, color: "var(--ink-faint)", fontWeight: 600 }}>Volume · 30 days</span>
        <div style={{ ...NUM, fontSize: compact ? 18 : 20, fontWeight: 700, marginTop: 5 }}>{usd(detail.stats?.volume30dUsd, { compact: true })}</div>
        {!compact && <VolumeBars values={vols} />}
      </>)}
      {card(<>
        <span style={{ fontSize: 10, color: "var(--ink-faint)", fontWeight: 600 }}>Holders</span>
        <div style={{ ...NUM, fontSize: compact ? 18 : 20, fontWeight: 700, marginTop: 5 }}>{count(top?.holders)}</div>
        <MiniLine values={pts.map((p) => p.holders ?? NaN)} />
        {trend(w?.holdersChange != null ? `${w.holdersChange >= 0 ? "+" : "−"}${count(Math.abs(w.holdersChange))} · 7 days` : null, (w?.holdersChange ?? 0) >= 0)}
      </>)}
      {!compact && card(<>
        <span style={{ fontSize: 10, color: "var(--ink-faint)", fontWeight: 600 }}>Range{ranges?.basis === "reference" ? " · the share" : ""}</span>
        {([["Day", ranges?.day], ["52 weeks", ranges?.week52]] as const).map(([l, r], i) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: i === 0 ? 9 : 11 }}>
            <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 10, color: "var(--ink-faint)" }}>{l}</span><span style={{ flexGrow: 1 }} /><span style={{ ...NUM, fontSize: 10, color: "var(--ink-soft)" }}>{r ? `${r.low.toFixed(2)} – ${r.high.toFixed(2)}` : "—"}</span></div>
            <div style={{ position: "relative", height: 5, borderRadius: 999, background: "var(--track)" }}>
              {r && <span style={{ position: "absolute", left: `${marker(r.low, r.high)}%`, top: -2, width: 3, height: 9, borderRadius: 2, background: "var(--ink)" }} />}
            </div>
          </div>
        ))}
      </>)}
    </div>
  );
}

/** Wikipedia text is CC BY-SA: say where it came from and link it. */
function AboutCredit({ detail }: { detail: AssetDetail }) {
  if (detail.aboutSource !== "wikipedia" || !detail.aboutUrl) return null;
  return <> <a href={detail.aboutUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--ink-faint)", textDecoration: "underline", whiteSpace: "nowrap" }}>From Wikipedia</a></>;
}

function AboutCard({ detail }: { detail: AssetDetail }) {
  const { asset, stats, reference } = detail;
  const n = detail.variants.filter((v) => !v.score.hidden).length;
  const facts: [string, ReactNode][] = [
    ["Market cap", usd(stats?.marketCapUsd, { compact: true })],
    ...(asset.cusip ? [["CUSIP", asset.cusip] as [string, ReactNode]] : []),
    ["Tokens on Solana", n],
    ...(detail.tokenizedSupply != null ? [["Tokenized supply", Math.round(detail.tokenizedSupply).toLocaleString("en-US")] as [string, ReactNode]] : []),
  ];
  return (
    <Panel style={{ padding: "16px 20px" }}>
      <Label>About {asset.name}</Label>
      {detail.about && <p style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.65, color: "var(--ink-soft)", maxWidth: "92ch" }}>{detail.about}<AboutCredit detail={detail} /></p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))`, gap: 14, marginTop: 16 }}>
        {facts.map(([l, v]) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontSize: 10, color: "var(--ink-faint)" }}>{l}</span><span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{v}</span></div>
        ))}
      </div>
    </Panel>
  );
}

function TopTokenCard({ detail, top, only, compact, holds, alternative }: { detail: AssetDetail; top: AssetVariantView; only?: boolean; compact?: boolean; holds?: boolean; alternative?: boolean }) {
  const s = top.score;
  const exit = useQuery({ queryKey: ["exit", top.mint], queryFn: () => api<{ ladder: { usdSize: number; status: string; roundTripPct: number | null }[] }>(`/api/exit?mint=${top.mint}`), staleTime: 120_000 });
  const leave = exit.data?.ladder[0];
  const why = `/asset/${encodeURIComponent(detail.asset.assetId)}/rating/${top.mint}`;
  return (
    <Panel accent="good" style={{ padding: compact ? "15px 16px" : "17px 19px", borderRadius: compact ? 17 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ display: "inline-flex", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--grade-a)", background: "var(--grade-a-bg)" }}>{holds ? (only ? "You hold the only token" : "You hold the highest rated") : alternative ? "Highest rated · the alternative" : only ? "The only token" : "Highest rated"}</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{top.issuer} · {tierLabel(top.tier)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 14 : 15, marginTop: compact ? 13 : 14 }}>
        <ScoreRing score={s.score} grade={s.grade} size={compact ? 70 : 78} />
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 3, minWidth: 0, flexGrow: 1 }}>
          {compact ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 600 }}>{top.symbol}</span>
                <span style={{ flexGrow: 1 }} />
                <span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{usd(top.priceUsd)}</span>
              </div>
              <PillarBar label="Ownership" value={s.ownership.score} height={5} compact />
              <PillarBar label="Exit" value={s.exit.score} height={5} compact />
            </>
          ) : (
            <>
              <span style={{ ...DISPLAY, fontSize: 20, fontWeight: 600 }}>{top.symbol}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--ink-faint)" }}>
                {top.issuer}
                {s.issuerConfirmed && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--grade-a)" }}>{Icon.check(11)}confirmed</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 2 }}>
                <span style={{ ...NUM, fontSize: 15, fontWeight: 700 }}>{usd(top.priceUsd)}</span>
                {top.gapPercent != null && <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{top.gapPercent >= 0 ? "+" : "−"}{Math.abs(top.gapPercent).toFixed(2)}% vs market</span>}
              </div>
            </>
          )}
        </div>
      </div>
      {!compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 15 }}>
          <PillarBar label="Ownership" value={s.ownership.score} />
          <PillarBar label="Exit" value={s.exit.score} />
        </div>
      )}
      {top.explanation && <p style={{ margin: "13px 0 0", fontSize: 12, lineHeight: 1.5, fontWeight: 600 }}>{top.explanation.headline}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--track)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>Cost to leave</span>
          <span style={{ ...NUM, fontSize: 14, fontWeight: 700, color: leave?.status === "ok" && (leave.roundTripPct ?? 0) < 1 ? "var(--grade-a)" : leave?.status === "ok" && (leave.roundTripPct ?? 0) < 10 ? "var(--grade-c)" : leave ? "var(--danger)" : "var(--ink-faint)" }}>
            {exit.isPending ? "…" : leave?.status === "ok" ? `${(leave.roundTripPct ?? 0).toFixed(2)}%` : leave?.status === "no-route" ? "No route" : "—"}
          </span>
        </div>
        {compact && top.gapPercent != null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, color: "var(--ink-faint)" }}>vs market</span><span style={{ ...NUM, fontSize: 13, fontWeight: 700 }}>{top.gapPercent >= 0 ? "+" : "−"}{Math.abs(top.gapPercent).toFixed(2)}%</span></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, color: "var(--ink-faint)" }}>Holders</span><span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{count(top.holders)}</span></div>
        )}
        <span style={{ flexGrow: 1 }} />
        <WhyButton href={why} grade={s.grade} score={s.score} />
      </div>
    </Panel>
  );
}

function NothingToCompare({ name }: { name: string }) {
  return (
    <Panel style={{ padding: "16px 18px" }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Nothing to compare</span>
      <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.55, color: "var(--ink-soft)" }}>Only one token tracks {name}, so there is no safer alternative to move to. Most companies are like this — the choice only matters where there are several, and we tell you when a second one appears.</p>
    </Panel>
  );
}

const BENEFIT: Record<string, { mark: ReactNode; fg: string; bg: string; strong: boolean }> = {
  yes: { mark: Icon.check(11), fg: "var(--grade-a)", bg: "var(--grade-a-bg)", strong: true },
  reinvested: { mark: Icon.check(11), fg: "var(--grade-a)", bg: "var(--grade-a-bg)", strong: true },
  "cash-value": { mark: "≈", fg: "var(--grade-b)", bg: "var(--grade-b-bg)", strong: true },
  partial: { mark: "~", fg: "var(--grade-c)", bg: "var(--grade-c-bg)", strong: true },
  no: { mark: "✕", fg: "var(--grade-d)", bg: "var(--grade-d-bg)", strong: false },
  "not-stated": { mark: "–", fg: "var(--ink-faint)", bg: "var(--track)", strong: false },
};

function benefitText(key: string, status: string, label: string) {
  if (key === "value") return status === "yes" ? "The share's economic value" : status === "partial" ? "Exposure through an SPV, not a share" : label;
  if (key === "redemption") return status === "yes" ? "Redeemable for the share" : status === "cash-value" ? "Redeemable for cash value" : status === "no" ? "No redemption" : "Redemption · not reported";
  if (key === "dividends") return status === "reinvested" ? "Dividends, reinvested into your balance — seen on-chain" : status === "no" ? "No dividend rights" : "Dividends · not stated by the issuer";
  if (key === "voting") return status === "no" ? "No voting rights" : "Voting rights · not stated";
  return label;
}

function BenefitsCard({ top }: { top: AssetVariantView }) {
  const b = top.explanation?.benefits ?? [];
  const ca = top.corporateAction;
  return (
    <Panel style={{ padding: "16px 18px" }}>
      <Label>Benefits</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {b.filter((x) => x.key !== "redemption").map((x) => {
          const t = BENEFIT[x.status] ?? BENEFIT["not-stated"];
          return (
            <div key={x.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: t.bg, color: t.fg, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{t.mark}</span>
              <span style={{ fontSize: 12, fontWeight: t.strong ? 600 : 500, color: t.strong ? "var(--ink)" : "var(--ink-soft)" }}>{benefitText(x.key, x.status, x.label)}</span>
            </div>
          );
        })}
      </div>
      {b.find((x) => x.key === "redemption") && <p style={{ margin: "12px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)" }}>{b.find((x) => x.key === "redemption")!.note} {top.redemptionNote ?? ""}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--track)" }}>
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Next balance change on-chain</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)" }}>
          {ca?.pending && ca.effectiveAt ? `×${(ca.newMultiplier / ca.multiplier).toLocaleString("en-US", { maximumFractionDigits: 4 })} on ${new Date(ca.effectiveAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "None scheduled"}
        </span>
      </div>
    </Panel>
  );
}

function ExitCard({ mint }: { mint: string }) {
  const q = useQuery({ queryKey: ["exit", mint], queryFn: () => api<{ ladder: { usdSize: number; status: string; roundTripPct: number | null }[] }>(`/api/exit?mint=${mint}`), staleTime: 120_000 });
  const rungs = q.data?.ladder ?? [];
  const worst = Math.max(5, ...rungs.map((r) => r.roundTripPct ?? 0));
  const quarter = rungs.find((r) => r.usdSize === 250_000);
  return (
    <Panel style={{ padding: "16px 18px" }}>
      <Label>What it costs to leave</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
        {q.isPending ? [0, 1, 2].map((i) => <div key={i} className="animate-pulse" style={{ height: 14, borderRadius: 6, background: "var(--track)" }} />)
          : rungs.map((r) => {
            const v = r.roundTripPct ?? 0;
            const color = r.status !== "ok" || v >= 10 ? "var(--danger)" : v >= 1 ? "var(--grade-b)" : "var(--grade-a)";
            return (
              <div key={r.usdSize} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--ink-soft)", width: 58 }}>${r.usdSize.toLocaleString("en-US")}</span>
                <div style={{ flexGrow: 1, height: 6, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}><div style={{ width: r.status === "ok" ? `${Math.max(2, (v / worst) * 100)}%` : "100%", height: 6, background: color }} /></div>
                <span style={{ ...NUM, fontSize: 12, fontWeight: 700, width: 54, textAlign: "right", color: r.status === "ok" ? "var(--ink)" : "var(--danger)" }}>{r.status === "ok" ? `${v.toFixed(2)}%` : r.status === "no-route" ? "No route" : "—"}</span>
              </div>
            );
          })}
      </div>
      <p style={{ margin: "11px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)" }}>
        {q.isError ? "Couldn't reach Jupiter just now — this says nothing about whether you can sell." : `Quoted both ways through Jupiter just now.${quarter?.status === "ok" && (quarter.roundTripPct ?? 99) < 2 ? " You could leave a quarter of a million under 2%." : ""}`}
      </p>
    </Panel>
  );
}



function Changes({ detail }: { detail: AssetDetail }) {
  const list = detail.signals.filter(isChange).slice(0, 4);
  if (!list.length) return null;
  const { asset } = detail;
  return (
    <Panel style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Label>Updates</Label>
        <span style={{ flexGrow: 1 }} />
        <Link href="/updates" style={{ fontSize: 11, fontWeight: 700, textDecoration: "none", color: "var(--grade-a)" }}>See all →</Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {list.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${s.kind === "routability-change" && s.to === "not tradable" ? "var(--danger-line)" : "var(--hairline)"}`, borderRadius: 14, padding: "12px 14px" }}>
            <CompanyLogo src={asset.logoUrl} name={asset.name} id={asset.assetId} size={34} />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{signalTitle(s)}</span>
              <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ink-soft)" }}>{signalWhy(s)}</span>
              <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>{signalMeta(s).split(" · ")[0]}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// private company — desktop (AssetPrivateDesktop)

function PrivateDesktop({ detail, top, others }: { detail: AssetDetail; top?: AssetVariantView; others: AssetVariantView[] }) {
  const { asset, externalRating, privateMark } = detail;
  const c = useChart(detail);
  const all = top ? [top, ...others] : others;
  const closeCall = detail.best?.closeCall;
  return (
    <main className="hidden lg:grid" style={{ padding: "20px 26px 24px", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 18, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <CompanyLogo src={asset.logoUrl} name={asset.name} id={asset.assetId} size={46} />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ ...DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{asset.name}</span>
              <span style={{ display: "inline-flex", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>
            </div>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Private company · {all.length} token{all.length === 1 ? "" : "s"} on Solana · no public share</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          {top && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <span style={{ ...NUM, fontSize: 26, fontWeight: 700 }}>{usd(top.priceUsd)}</span>
              {top.priceBasis === "trades" && top.listedPriceUsd != null && <span style={{ fontSize: 11, color: "var(--grade-c)", fontWeight: 600 }}>where it trades · issuer lists {usd(top.listedPriceUsd)}</span>}
            </div>
          )}
        </div>

        {top && (
          <Panel style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 700 }}>Two ratings of the same token</span>
              <span style={{ flexGrow: 1 }} />
              <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{top.symbol} · today</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              {externalRating && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--canvas)", borderRadius: 15, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ ...NUM, display: "inline-flex", gap: 6, alignItems: "baseline", borderRadius: 12, padding: "8px 14px", fontSize: 26, fontWeight: 700, color: "var(--grade-a)", background: "var(--grade-a-bg)" }}>{externalRating.grade}<span style={{ fontSize: 20 }}>{externalRating.score}</span></span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{externalRating.label ? `“${externalRating.label}”` : "Market score"}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>tokens.xyz market score</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>What it measures</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {externalRating.components.map((x) => (
                        <span key={x.key} style={{ display: "inline-flex", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--hairline)" }}>
                          {x.key.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase())} · market
                        </span>
                      ))}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>{externalRating.components.length} of {externalRating.components.length} inputs are about the market.</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--danger-soft)", borderRadius: 15, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ ...NUM, display: "inline-flex", gap: 6, alignItems: "baseline", borderRadius: 12, padding: "8px 14px", fontSize: 26, fontWeight: 700, color: "var(--grade-d)", background: "var(--grade-d-bg)" }}>{top.score.grade}<span style={{ fontSize: 20 }}>{top.score.score}</span></span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Trova</span>
                    <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>what you own × whether you can leave</span>
                  </div>
                </div>
                <PillarBar label="Ownership" value={top.score.ownership.score} height={7} />
                <PillarBar label="Exit" value={top.score.exit.score} height={7} />
                <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>√({top.score.ownership.score} × {top.score.exit.score}) = {top.score.score}. The market half agrees with tokens.xyz. The other half is what you own.</span>
              </div>
            </div>
            {top.explanation && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, fontWeight: 600 }}>{top.explanation.headline}</p>}
          </Panel>
        )}

        {detail.about && (
          <Panel style={{ padding: "16px 20px" }}>
            <Label>About {asset.name}</Label>
            <p style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.65, color: "var(--ink-soft)", maxWidth: "92ch" }}>{detail.about}<AboutCredit detail={detail} /></p>
          </Panel>
        )}
        <Panel style={{ padding: "16px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>Price</span>
            <span style={{ flexGrow: 1 }} />
            <RangeTabs value={c.range} onChange={c.setRange} available={c.available} />
          </div>
          <div style={{ marginTop: 8 }}><PriceChart token={c.series.token} height={200} /></div>
        </Panel>

        {top && <RatingHistoryCard top={top} />}

        {top?.explanation && (
          <Panel style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>What holding it gets you</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              {top.explanation.benefits.map((b) => (
                <div key={b.key} style={{ display: "flex", flexDirection: "column", gap: 6, background: b.status === "partial" ? "var(--warn-soft)" : "var(--canvas)", borderRadius: 13, padding: "13px 14px" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{b.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: b.status === "no" ? "var(--grade-d)" : b.status === "partial" ? "var(--grade-c)" : b.status === "not-stated" ? "var(--ink-faint)" : "var(--grade-a)" }}>
                    {b.status === "no" ? "No" : b.status === "partial" ? "Through an SPV" : b.status === "not-stated" ? "Not stated" : "Yes"}
                  </span>
                  <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ink-soft)" }}>{b.note}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Panel style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>Tokens for {asset.name}</span>
            <span style={{ flexGrow: 1 }} />
            {closeCall && <span style={{ display: "inline-flex", borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "var(--ink-soft)", background: "var(--track)" }}>Close call</span>}
          </div>
          {all.map((v, i) => (
            <Link key={v.mint} href={`/asset/${encodeURIComponent(asset.assetId)}/rating/${v.mint}`} style={{ display: "flex", alignItems: "center", gap: 12, border: i === 0 ? "2px solid var(--hairline)" : "1px solid var(--hairline)", borderRadius: 14, padding: "12px 14px", textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ ...DISPLAY, fontSize: 14, fontWeight: 600 }}>{v.symbol}</span>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{usd(v.liquidityUsd, { compact: true })} depth · {count(v.holders)} holders</span>
              </div>
              <span style={{ flexGrow: 1 }} />
              <GradePill grade={v.score.grade} score={v.score.score} />
            </Link>
          ))}
          {all.length > 1 && <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-soft)" }}>{all.every((v) => v.score.instrument.speculative) ? `All of them are SPV exposure. None is a safer way to own ${asset.name}.` : "Ranked on what you'd own and whether you could get back out."}</span>}
        </Panel>

        {privateMark && (
          <Panel style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>Private valuation</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Last private mark</span><span style={{ flexGrow: 1 }} /><span style={{ ...NUM, fontSize: 17, fontWeight: 700 }}>${(privateMark.markValuationUsd / 1e12).toFixed(2)}T</span></div>
              {privateMark.atTradedPrice ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 12, color: "var(--ink-soft)" }}>At the price it trades, {usd(privateMark.atTradedPrice.tradedUsd)}</span><span style={{ flexGrow: 1 }} /><span style={{ ...NUM, fontSize: 17, fontWeight: 700 }}>${(privateMark.atTradedPrice.impliedValuationUsd / 1e12).toFixed(2)}T</span></div>
                  {privateMark.impliedValuationUsd != null && <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 12, color: "var(--ink-faint)" }}>At the issuer&apos;s reference price, {usd(privateMark.atTradedPrice.listedUsd)}</span><span style={{ flexGrow: 1 }} /><span style={{ ...NUM, fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}>${(privateMark.impliedValuationUsd / 1e12).toFixed(2)}T</span></div>}
                  <div style={{ borderTop: "1px solid var(--track)", paddingTop: 10 }}>
                    <span style={{ display: "inline-flex", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Trades at {privateMark.atTradedPrice.premiumToMarkPercent >= 0 ? "+" : "−"}{Math.abs(privateMark.atTradedPrice.premiumToMarkPercent).toFixed(0)}% to the mark</span>
                  </div>
                </>
              ) : privateMark.impliedValuationUsd != null ? (
                <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 12, color: "var(--ink-soft)" }}>This token implies</span><span style={{ flexGrow: 1 }} /><span style={{ ...NUM, fontSize: 17, fontWeight: 700 }}>${(privateMark.impliedValuationUsd / 1e12).toFixed(2)}T</span></div>
              ) : null}
            </div>
            <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-soft)" }}>There is no public market for {asset.name}. No price here is compared with a listed share.</span>
          </Panel>
        )}

        {top && <ExitCard mint={top.mint} />}

        <section style={{ background: "var(--warn-soft)", border: "1px solid var(--grade-c-bg)", borderRadius: 18, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--grade-c)" }}>Speculative · pre-IPO exposure</span>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--ink)" }}>{top?.score.instrument.summary}</p>
        </section>
      </aside>
    </main>
  );
}

function RatingHistoryCard({ top }: { top: AssetVariantView }) {
  const pts = top.history?.points ?? [];
  if (pts.length < 2) return null;
  const own = pts.map((p) => p.ownership);
  const ex = pts.map((p) => p.exit);
  const y = (v: number) => 130 - v * 1.2;
  const line = (vals: number[]) => vals.map((v, i) => `${((i / (vals.length - 1)) * 1000).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const say = (vals: number[], name: string) => (Math.min(...vals) === Math.max(...vals) ? `${name} held at ${vals[0]} every day` : `${name} moved between ${Math.min(...vals)} and ${Math.max(...vals)}`);
  const d = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <Panel style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 700 }}>Rating over {pts.length} days</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-soft)" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--grade-d)" }} />Ownership</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-soft)" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: "var(--grade-a)" }} />Exit</span>
      </div>
      <svg width="100%" height="150" viewBox="0 0 1000 150" preserveAspectRatio="none" style={{ display: "block" }} aria-label={`${say(own, "Ownership")}; ${say(ex, "Exit")}`} role="img">
        {[10, 70, 130].map((yy) => <line key={yy} x1="0" x2="1000" y1={yy} y2={yy} stroke="var(--track)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <polyline points={line(own)} fill="none" stroke="var(--grade-d)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={line(ex)} fill="none" stroke="var(--grade-a)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", fontSize: 10, color: "var(--ink-faint)" }}><span>{d(pts[0].date)}</span><span style={{ flexGrow: 1 }} /><span>{d(pts[pts.length - 1].date)} · checked daily</span></div>
      <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{say(own, "Ownership")}. {say(ex, "Exit")}.</span>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// mobile (AssetMobile)

function AssetMobile({ detail, top, others, priv, swapFrom, options, ctx }: { detail: AssetDetail; top?: AssetVariantView; others: AssetVariantView[]; priv: boolean; swapFrom?: SwapFrom; options: TokenOption[]; ctx: HeldCtx }) {
  const { asset } = detail;
  const c = useChart(detail);
  const benefits = top?.explanation?.benefits ?? [];
  return (
    <div className="flex lg:hidden" style={{ flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ background: "var(--surface)", padding: "10px 14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link href="/markets" aria-label="Back" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, marginLeft: -8, borderRadius: 12, color: "var(--ink)" }}>{Icon.back(20)}</Link>
          <span style={{ flexGrow: 1 }} />
          <WatchButton assetId={asset.assetId} iconOnly />
          <HelpButton size={40} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
          <CompanyLogo src={asset.logoUrl} name={asset.name} id={asset.assetId} size={46} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: -0.4 }}>{asset.name}</span>
              {asset.symbol && <span style={{ display: "inline-flex", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: "var(--ink-soft)", background: "var(--track)" }}>{asset.symbol}</span>}
            </div>
            <span style={{ fontSize: 11, color: priv ? "var(--grade-c)" : "var(--ink-faint)", fontWeight: priv ? 700 : 500 }}>{priv ? "Speculative · private company" : asset.assetClass === "etf" ? "ETF" : asset.assetClass === "metal" ? "Metal" : "Stock"}</span>
          </div>
        </div>
        {top && !priv && <span style={{ display: "block", marginTop: 14, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink-faint)" }}>On-chain · {top.symbol}</span>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: top && !priv ? 2 : 14, flexWrap: "wrap" }}>
          <span style={{ ...NUM, fontSize: 33, fontWeight: 700, letterSpacing: -1 }}>{top ? usd(top.priceUsd) : "—"}</span>
          {c.change != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13, fontWeight: 700, color: c.change >= 0 ? "var(--grade-a)" : "var(--danger)" }}>
              {c.change >= 0 ? Icon.up() : Icon.down()}{Math.abs(c.changePct ?? 0).toFixed(2)}%
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{RANGE_WORDS[c.range]}</span>
        </div>
        {detail.reference && !priv && top?.gapPercent != null && <div style={{ marginTop: 10 }}><MarketPriceBlock detail={detail} compact /></div>}
        <div style={{ marginTop: 12 }}><PriceChart token={c.series.token} reference={c.series.ref} height={132} labels={false} /></div>
        <div style={{ marginTop: 10 }}><RangeTabs value={c.range} onChange={c.setRange} available={c.available} full /></div>
      </div>

      <div style={{ flexGrow: 1, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
        {ctx.heldWeaker && top && <HeldCard detail={detail} held={ctx.heldWeaker} top={top} swapFrom={ctx.swapFrom} />}
        {top && <TopTokenCard detail={detail} top={top} only={others.length === 0} compact holds={ctx.holdsTop} alternative={!!ctx.heldWeaker} />}
        {others.length > 0 && top && <CompareButton detail={detail} all={[top, ...others]} heldMint={ctx.held?.variant.mint} />}
        {priv && top && (
          <div style={{ background: "var(--warn-soft)", borderRadius: 17, padding: "14px 16px", fontSize: 12, lineHeight: 1.55 }}>
            <b style={{ color: "var(--grade-c)" }}>Speculative. </b>{top.score.instrument.summary}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600, padding: "0 4px" }}>The market for this {priv ? "token" : "stock"}</span>
          <StatGrid detail={detail} top={top} compact />
        </div>
        {benefits.length > 0 && (
          <section style={{ background: "var(--surface)", borderRadius: 17, padding: "15px 16px" }}>
            <Label>Benefits</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
              {benefits.map((b) => {
                const good = b.status === "yes" || b.status === "reinvested" || b.status === "cash-value";
                return (
                  <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "6px 11px", fontSize: 11, fontWeight: good ? 700 : 600, color: good ? "var(--grade-a)" : b.status === "no" ? "var(--grade-d)" : "var(--ink-faint)", background: good ? "var(--grade-a-bg)" : "var(--track)" }}>
                    {good && Icon.check(11)}{benefitText(b.key, b.status, b.label).replace(" — seen on-chain", "")}
                  </span>
                );
              })}
            </div>
          </section>
        )}
        {others.length === 0 && <NothingToCompare name={asset.name} />}
        {top && <ExitCard mint={top.mint} />}
        {detail.about && (
          <section style={{ background: "var(--surface)", borderRadius: 17, padding: "15px 16px" }}>
            <Label>About {asset.name}</Label>
            <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--ink-soft)" }}>{detail.about}<AboutCredit detail={detail} /></p>
          </section>
        )}
      </div>

      {top && (
        <div style={{ position: "sticky", bottom: 76, display: "flex", gap: 10, padding: "12px 14px", background: "var(--surface)", borderTop: "1px solid var(--hairline)", zIndex: 20 }}>
          {ctx.sellFrom && <SellTrigger from={ctx.sellFrom} assetName={asset.name} assetId={asset.assetId} logoUrl={asset.logoUrl} block />}
          {swapFrom && <TradeTrigger label="Swap" variant="secondary" assetName={asset.name} assetId={asset.assetId} logoUrl={asset.logoUrl} options={[toOption(top)]} defaultMint={top.mint} from={swapFrom} />}
          <div style={{ flexGrow: 1, display: "flex" }}>
            <TradeTrigger label={`Buy ${top.symbol}`} variant="block" assetName={asset.name} assetId={asset.assetId} logoUrl={asset.logoUrl} options={options} defaultMint={top.mint} />
          </div>
        </div>
      )}
    </div>
  );
}

