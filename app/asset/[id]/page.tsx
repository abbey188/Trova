import Link from "next/link";
import { notFound } from "next/navigation";

import { ExitLadder, WatchButton } from "@/components/trova/asset-actions";
import { RangeChart } from "@/components/trova/charts";
import { GradeBadge } from "@/components/trova/grade-badge";
import { ReferenceCard } from "@/components/trova/reference-card";
import { AssetLogo } from "@/components/trova/search";
import { Card, Shell } from "@/components/trova/shell";
import { TradeTrigger } from "@/components/trova/trade-trigger";
import type { TokenOption } from "@/components/trova/trade-sheet";
import { VariantCard } from "@/components/trova/variant-card";
import { buildAssetDetail } from "@/lib/asset";
import { count, usd } from "@/lib/format";
import type { AssetVariantView, TrendSummary } from "@/lib/types";

export const revalidate = 120;

const BENEFIT_TONE: Record<string, { mark: string; fg: string; bg: string; word: string }> = {
  yes: { mark: "✓", fg: "var(--grade-a)", bg: "var(--grade-a-bg)", word: "Yes" },
  reinvested: { mark: "✓", fg: "var(--grade-a)", bg: "var(--grade-a-bg)", word: "Reinvested" },
  "cash-value": { mark: "≈", fg: "var(--grade-b)", bg: "var(--grade-b-bg)", word: "Cash value" },
  partial: { mark: "~", fg: "var(--grade-c)", bg: "var(--grade-c-bg)", word: "Partly" },
  no: { mark: "✕", fg: "var(--danger)", bg: "var(--danger-bg)", word: "No" },
  "not-stated": { mark: "?", fg: "var(--ink-faint)", bg: "var(--canvas)", word: "Not stated" },
};

function trendLine(t: TrendSummary | undefined, kind: "liquidity" | "holders"): { text: string; up: boolean } | null {
  if (!t || t.days < 2) return null;
  if (kind === "liquidity" && t.liquidityChangePct != null) {
    const p = t.liquidityChangePct;
    return { text: `${p >= 0 ? "+" : ""}${Math.abs(p) >= 99.5 && p < 0 ? "−99%+" : `${p.toFixed(1)}%`} · 7 days`, up: p >= 0 };
  }
  if (kind === "holders" && t.holdersChange != null) {
    const n = t.holdersChange;
    return { text: `${n >= 0 ? "+" : "−"}${count(Math.abs(n))} · 7 days`, up: n >= 0 };
  }
  return null;
}

function toOption(v: AssetVariantView): TokenOption {
  return {
    mint: v.mint, symbol: v.symbol, issuer: v.issuer, grade: v.score.grade, score: v.score.score,
    routable: v.score.routable, notRoutableReason: v.score.notRoutableReason, liquidityUsd: v.liquidityUsd,
    priceUsd: v.priceUsd, speculative: v.score.instrument.speculative, instrumentSummary: v.score.instrument.summary,
  };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = decodeURIComponent(id);
  const detail = await buildAssetDetail(assetId);
  if (!detail) notFound();

  const { asset, variants, best, reference, privateMark, signals, historyDays, priceHistory, externalRating } = detail;
  const shown = variants.filter((v) => !v.score.hidden);
  const top = shown.find((v) => v.mint === best?.mint) ?? shown[0];
  const charted = shown.find((v) => v.mint === priceHistory?.mint) ?? top;
  const runnerUp = best?.closeCall ? shown.find((v) => v.mint === best.runnerUpMint)?.symbol ?? null : null;
  const options = shown.map(toOption);
  const speculative = shown.some((v) => v.score.instrument.speculative);
  const e = top?.explanation;
  const w = top?.history?.trend7d;
  const liq = trendLine(w, "liquidity");
  const hold = trendLine(w, "holders");
  const ca = top?.corporateAction;

  return (
    <Shell
      active="markets"
      back={{ href: "/markets", label: "Markets" }}
      title={
        <span className="flex items-center gap-3">
          <AssetLogo src={top?.logoURI} name={asset.name} size={32} />
          <span>{asset.name}</span>
          <span className="rounded-[6px] px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--canvas)", color: "var(--ink-soft)" }}>{asset.symbol}</span>
          {speculative && <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
        </span>
      }
      subtitle={
        <span>
          {privateMark ? "Private company" : asset.cusip ? `CUSIP ${asset.cusip}` : asset.assetClass === "metal" ? "Metal" : asset.assetClass === "etf" ? "ETF" : "Stock"}
          {" · "}{shown.length} token{shown.length === 1 ? "" : "s"} on Solana
        </span>
      }
      actions={
        <>
          <WatchButton assetId={assetId} />
          {top && <TradeTrigger label={`Buy ${top.symbol}`} assetName={asset.name} options={options} defaultMint={top.mint} />}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display tabular text-[34px] font-bold tracking-tight">{charted ? usd(charted.priceUsd) : "—"}</span>
              <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>{charted?.symbol}</span>
              {charted?.priceBasis === "trades" && charted.listedPriceUsd != null && (
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--grade-c-bg)", color: "var(--grade-c)" }}>
                  where it trades · issuer lists {usd(charted.listedPriceUsd)}
                </span>
              )}
            </div>
            {priceHistory ? (
              <RangeChart
                points={priceHistory.daily.token.map((c) => ({ time: c.time, value: c.close }))}
                caption={`${charted?.symbol ?? "token"} price`}
                reference={priceHistory.daily.reference ? { label: `${priceHistory.daily.reference.ticker}, the listed share`, points: priceHistory.daily.reference.closes.map((c) => ({ time: c.time, value: c.close })) } : null}
                defaultRange="3M"
              />
            ) : (
              <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>No price history yet.</span>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Liquidity" value={usd(top?.liquidityUsd, { compact: true })} trend={liq} />
            <Stat label="Traded, 24h" value={usd(top?.volume24hUsd, { compact: true })} />
            <Stat label="Holders" value={count(top?.holders)} trend={hold} />
            <Stat
              label={priceHistory?.ranges.basis === "reference" ? "52 weeks, the share" : "52 weeks"}
              value={priceHistory?.ranges.week52 ? `${usd(priceHistory.ranges.week52.low)} – ${usd(priceHistory.ranges.week52.high)}` : "—"}
              small
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-[16px] font-semibold">{shown.length === 1 ? "The only token" : "Which token to hold"}</h2>
              <p className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                {shown.length === 1
                  ? `Only one token tracks ${asset.name}, so there's nothing safer to move to. We'll tell you if a second one appears.`
                  : "Same company, different issuers. Ranked on what you'd own and whether you could get back out."}
              </p>
            </div>
            {shown.map((v) => (
              <VariantCard key={v.mint} assetId={assetId} variant={v} referenceTicker={reference?.ticker} closeCallWith={best?.closeCall && best.mint === v.mint ? runnerUp : null} />
            ))}
          </div>

          {detail.about && (
            <Card className="flex flex-col gap-2 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>About {asset.name}</span>
              <p className="max-w-[75ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>{detail.about}</p>
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {top && (
            <Card className="flex flex-col gap-4 p-5" >
              <div className="flex items-center gap-2">
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--grade-a)", background: "var(--grade-a-bg)" }}>
                  {shown.length === 1 ? "The only token" : "Highest rated"}
                </span>
                <span className="ml-auto text-[12px]" style={{ color: "var(--ink-faint)" }}>{top.issuer}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-[18px] font-semibold">{top.symbol}</span>
                <span className="ml-auto"><GradeBadge grade={top.score.grade} score={top.score.score} size="lg" /></span>
              </div>
              {e && <p className="text-[13px] font-semibold leading-snug">{e.headline}</p>}
              {(["ownership", "exit"] as const).map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <div className="flex text-[12px]"><span className="font-semibold capitalize">{k}</span><span className="tabular ml-auto font-bold">{top.score[k].score}</span></div>
                  <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
                    <div className="h-full rounded-full" style={{ width: `${top.score[k].score}%`, background: top.score[k].score >= 65 ? "var(--grade-a)" : top.score[k].score >= 50 ? "var(--grade-c)" : "var(--danger)" }} />
                  </div>
                </div>
              ))}
              {e?.movement && <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{e.movement}</span>}
              <Link href={`/asset/${encodeURIComponent(assetId)}/rating/${top.mint}`} className="text-[13px] font-semibold">
                Why {top.score.score ?? "not rated"}? →
              </Link>
              <div className="pt-1" style={{ borderTop: "1px solid var(--hairline)" }}>
                <div className="pt-3"><ExitLadder mint={top.mint} /></div>
              </div>
            </Card>
          )}

          {externalRating && top && (
            <Card className="flex flex-col gap-3 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Two ratings of {top.symbol}</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 rounded-[12px] p-3" style={{ background: "var(--canvas)" }}>
                  <GradeBadge grade={(["A", "B", "C", "D"].includes(externalRating.grade ?? "") ? externalRating.grade : "NR") as "A"} score={externalRating.score} />
                  <span className="text-[12px] font-semibold">{externalRating.label ? `“${externalRating.label}”` : "Market score"}</span>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>tokens.xyz · {externalRating.components.length} of {externalRating.components.length} inputs measure the market</span>
                </div>
                <div className="flex flex-col gap-1.5 rounded-[12px] p-3" style={{ background: "var(--canvas)" }}>
                  <GradeBadge grade={top.score.grade} score={top.score.score} />
                  <span className="text-[12px] font-semibold">Trova</span>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>Exit {top.score.exit.score} × Ownership {top.score.ownership.score}</span>
                </div>
              </div>
              <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                {top.score.ownership.score < 50
                  ? "They agree on the market. What they disagree on is what you own."
                  : "Both see a sound market here; Trova also checks what holding it gives you."}
              </span>
            </Card>
          )}

          {e && e.benefits.length > 0 && (
            <Card className="flex flex-col gap-3 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>What holding {top?.symbol} gets you</span>
              {e.benefits.map((b) => {
                const t = BENEFIT_TONE[b.status] ?? BENEFIT_TONE["not-stated"];
                return (
                  <div key={b.key} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold" style={{ color: t.fg, background: t.bg }}>{t.mark}</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-semibold">{b.label} · <span style={{ color: t.fg }}>{t.word}</span></span>
                      <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{b.note}</span>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {privateMark && (
            <Card className="flex flex-col gap-2 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Private valuation</span>
              <Line label="Last private mark" value={`$${(privateMark.markValuationUsd / 1e12).toFixed(2)}T`} />
              {privateMark.atTradedPrice ? (
                <>
                  <Line label={`At the price it trades, ${usd(privateMark.atTradedPrice.tradedUsd)}`} value={`$${(privateMark.atTradedPrice.impliedValuationUsd / 1e12).toFixed(2)}T`} />
                  {privateMark.impliedValuationUsd != null && <Line label={`At the issuer's reference price, ${usd(privateMark.atTradedPrice.listedUsd)}`} value={`$${(privateMark.impliedValuationUsd / 1e12).toFixed(2)}T`} faint />}
                  <span className="mt-1 self-start rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>
                    Trades at {privateMark.atTradedPrice.premiumToMarkPercent >= 0 ? "+" : ""}{privateMark.atTradedPrice.premiumToMarkPercent.toFixed(0)}% to the mark
                  </span>
                </>
              ) : privateMark.impliedValuationUsd != null ? (
                <Line label="This token implies" value={`$${(privateMark.impliedValuationUsd / 1e12).toFixed(2)}T`} />
              ) : null}
              <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>There is no public market. No price here is compared with a listed share.</span>
            </Card>
          )}

          {ca && (
            <Card className="flex flex-col gap-1 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Next balance change, read from the mint</span>
              {ca.pending && ca.effectiveAt ? (
                <span className="text-[13px] font-semibold">
                  ×{(ca.newMultiplier / ca.multiplier).toLocaleString("en-US", { maximumFractionDigits: 4 })} on {new Date(ca.effectiveAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              ) : (
                <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>None scheduled</span>
              )}
            </Card>
          )}

          <ReferenceCard reference={reference} />

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>What changed</span>
              <span className="ml-auto text-[11px]" style={{ color: "var(--ink-faint)" }}>{historyDays} days watched</span>
            </div>
            {signals.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--ink-soft)" }}>Nothing has moved. A rating change must hold three daily checks before it shows here.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {signals.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s.severity === "danger" ? "var(--danger)" : s.severity === "warn" ? "var(--grade-c)" : "var(--grade-a)" }} />
                    <span className="text-[12px] leading-snug" style={{ color: "var(--ink-soft)" }}>{s.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </Shell>
  );
}

function Stat({ label, value, trend, small }: { label: string; value: string; trend?: { text: string; up: boolean } | null; small?: boolean }) {
  return (
    <div className="card-surface flex flex-col gap-1 rounded-[14px] p-4">
      <span className="text-[11px] font-semibold" style={{ color: "var(--ink-faint)" }}>{label}</span>
      <span className={`font-display tabular font-bold ${small ? "text-[14px]" : "text-[19px]"}`}>{value}</span>
      {trend && <span className="text-[11px] font-semibold" style={{ color: trend.up ? "var(--grade-a)" : "var(--danger)" }}>{trend.text}</span>}
    </div>
  );
}

function Line({ label, value, faint }: { label: string; value: string; faint?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[12px]" style={{ color: faint ? "var(--ink-faint)" : "var(--ink-soft)" }}>{label}</span>
      <span className={`font-display tabular ml-auto font-bold ${faint ? "text-[13px]" : "text-[16px]"}`} style={{ color: faint ? "var(--ink-soft)" : "var(--ink)" }}>{value}</span>
    </div>
  );
}
