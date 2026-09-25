"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { RangeChart, Sparkline } from "@/components/trova/charts";
import { GradeBadge } from "@/components/trova/grade-badge";
import { AssetLogo } from "@/components/trova/search";
import { Card } from "@/components/trova/shell";
import { useWalletAddress } from "@/components/trova/wallet";
import { api, shortAddress } from "@/lib/client";
import { count, usd } from "@/lib/format";
import type { Holding, MonitoringStats, PortfolioSummary, Rating, Signal } from "@/lib/types";

const gradeOf = (s: number): Rating => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : "D");
const TONE: Record<Rating, string> = { A: "var(--grade-a)", B: "var(--grade-b)", C: "var(--grade-c)", D: "var(--grade-d)", NR: "var(--grade-nr)" };

function needsAttention(h: Holding) {
  const s = h.variant.score;
  return !s.routable || !s.rated || s.grade === "D" || s.advisory != null;
}

export function PortfolioView({ address }: { address: string }) {
  const mine = useWalletAddress() === address;
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${address}`),
    staleTime: 60_000,
  });
  const stats = useQuery({
    queryKey: ["stats", 7],
    queryFn: () => api<{ stats?: MonitoringStats }>("/api/signals?days=7"),
    staleTime: 300_000,
  });
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ nickname: string | null }>("/api/me", { device: true }),
    enabled: mine,
    retry: false,
  });

  const name = mine && profile.data?.nickname ? profile.data.nickname : null;
  const [filter, setFilter] = useState<"all" | "attention">("all");

  if (portfolio.isPending) return <Loading />;
  if (portfolio.isError) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <span className="font-display text-[17px] font-semibold">We couldn&apos;t read this wallet just now</span>
        <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>{portfolio.error.message}</span>
        <button type="button" onClick={() => portfolio.refetch()} className="h-10 rounded-[11px] px-4 text-[13px] font-bold" style={{ background: "var(--action)", color: "var(--action-ink)" }}>
          Try again
        </button>
      </Card>
    );
  }

  const p = portfolio.data;
  const total = p.totalValueUsd + p.cashValueUsd;
  const attention = p.holdings.filter((h) => h.valueUsd > 0 && needsAttention(h));
  const shown = filter === "attention" ? attention : p.holdings;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-[22px] font-semibold">
          {mine ? (name ? `Welcome back, ${name}` : "Your portfolio") : `Wallet ${shortAddress(address)}`}
        </h1>
        {!mine && <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>Read-only, from its public address</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Portfolio value</span>
              <span className="font-display tabular text-[36px] font-bold leading-none tracking-tight">{usd(total)}</span>
              {p.cashValueUsd > 0 && (
                <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  {usd(p.totalValueUsd)} in tokenized assets · {usd(p.cashValueUsd)} cash
                </span>
              )}
            </div>
            {p.valueHistory && p.valueHistory.points.length > 1 ? (
              <>
                <RangeChart
                  points={p.valueHistory.points.map((x) => ({ time: x.time, value: x.valueUsd }))}
                  caption="today's holdings"
                  defaultRange="3M"
                />
                {p.valueHistory.excluded.length > 0 && (
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    Not in the line: {p.valueHistory.excluded.map((e) => `${e.symbol} (${e.reason})`).join(", ")}.
                  </span>
                )}
                <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                  What the holdings you have today were worth each day. Not your returns — we can&apos;t see what you paid.
                </span>
              </>
            ) : null}
          </Card>

          <Card className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-4">
              <h2 className="font-display text-[16px] font-semibold">Holdings</h2>
              <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>{p.holdings.length}</span>
              {attention.length > 0 && (
                <div className="ml-auto flex gap-1">
                  {(["all", "attention"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={filter === f ? { background: "var(--ink)", color: "var(--surface)" } : { color: "var(--ink-soft)", border: "1px solid var(--hairline)" }}
                    >
                      {f === "all" ? "All" : `Needs attention · ${attention.length}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {p.holdings.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-5 pb-6 pt-2">
                <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
                  No tokenized stocks, ETFs or metals in this wallet{p.otherTokens > 0 ? ` — ${count(p.otherTokens)} other tokens aren't rated here` : ""}.
                </span>
                <Link href="/markets" className="h-10 rounded-[11px] px-4 py-2.5 text-[13px] font-bold" style={{ background: "var(--action)", color: "var(--action-ink)" }}>Browse markets</Link>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="hidden grid-cols-[minmax(0,1fr)_100px_120px_110px_76px] gap-4 px-5 py-2 text-[11px] font-semibold md:grid" style={{ color: "var(--ink-faint)", borderBottom: "1px solid var(--hairline)" }}>
                  <span>Company</span><span>90 days</span><span className="text-right">Value</span><span className="text-right">If sold today</span><span className="text-right">Rating</span>
                </div>
                {shown.map((h) => <HoldingRow key={h.variant.mint} h={h} />)}
                {p.cash.filter((c) => (c.valueUsd ?? 0) > 0.5).map((c) => (
                  <div key={c.mint} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 md:grid-cols-[minmax(0,1fr)_100px_120px_110px_76px]" style={{ borderTop: "1px solid var(--hairline)" }}>
                    <div className="flex items-center gap-3">
                      <AssetLogo name="$" size={36} />
                      <div className="flex flex-col"><span className="text-[13px] font-semibold">Cash</span><span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>{c.symbol}</span></div>
                    </div>
                    <span className="hidden md:block" />
                    <span className="font-display tabular text-right text-[14px] font-bold">{usd(c.valueUsd)}</span>
                    <span className="hidden md:block" />
                    <span className="hidden text-right text-[11px] md:block" style={{ color: "var(--ink-faint)" }}>not rated</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <ScoreCard p={p} />

          {p.needsAttentionUsd > 0 && (
            <button
              type="button"
              onClick={() => setFilter("attention")}
              className="flex items-center gap-3 rounded-[16px] p-5 text-left"
              style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-line)" }}
            >
              <div className="flex flex-col gap-1">
                <span className="font-display tabular text-[26px] font-bold leading-none">{usd(p.needsAttentionUsd)}</span>
                <span className="text-[12px] font-semibold" style={{ color: "var(--danger)" }}>
                  across {p.needsAttentionCount} holding{p.needsAttentionCount === 1 ? "" : "s"} that need attention
                </span>
              </div>
              <svg className="ml-auto" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.4" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          )}

          {p.speculativeUsd > 0 && (
            <Card className="flex flex-col gap-1 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--grade-c)" }}>Speculative</span>
              <span className="font-display tabular text-[20px] font-bold">{usd(p.speculativeUsd)}</span>
              <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                {total > 0 ? `${Math.round((p.speculativeUsd / total) * 100)}% of the portfolio` : ""} in private companies, through an SPV
              </span>
            </Card>
          )}

          <Changes signals={p.signals} />

          {stats.data?.stats && (
            <Card className="flex flex-col gap-2 p-5">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>What we watched this week</span>
              <Stat n={stats.data.stats.variantsTracked} label="tokens rated every day" />
              <Stat n={stats.data.stats.ratingsChangedAndHeld} label="ratings changed and held" />
              <Stat n={stats.data.stats.becameUntradable} label="stopped being tradable" tone="var(--danger)" />
              <Link href="/updates" className="mt-1 text-[12px] font-semibold">See every update →</Link>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display tabular w-12 text-[20px] font-bold" style={{ color: tone }}>{count(n)}</span>
      <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{label}</span>
    </div>
  );
}

function ScoreCard({ p }: { p: PortfolioSummary }) {
  const rated = p.holdings.some((h) => h.variant.score.score != null);
  const score = p.scores.overall;
  const grade = gradeOf(score);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <Card className="flex items-center gap-4 p-5">
      <svg width="86" height="86" viewBox="0 0 86 86" className="shrink-0" role="img" aria-label={rated ? `Trova Score ${grade} ${score}` : "Not rated"}>
        <circle cx="43" cy="43" r={r} fill="none" stroke="var(--canvas)" strokeWidth="9" />
        {rated && <circle cx="43" cy="43" r={r} fill="none" stroke={TONE[grade]} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 43 43)" />}
        <text x="43" y="41" textAnchor="middle" className="font-display" fontSize="21" fontWeight="700" fill="var(--ink)">{rated ? score : "–"}</text>
        <text x="43" y="57" textAnchor="middle" fontSize="11" fontWeight="700" fill={TONE[grade]}>{rated ? grade : "NR"}</text>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Trova Score · weighted by value</span>
        {(["ownership", "exit"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <div className="flex text-[12px]"><span className="font-semibold capitalize">{k}</span><span className="tabular ml-auto font-bold">{p.scores[k]}</span></div>
            <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
              <div className="h-full rounded-full" style={{ width: `${p.scores[k]}%`, background: TONE[gradeOf(p.scores[k])] }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function sellLabel(h: Holding): { text: string; tone: string } {
  const s = h.sellNow;
  if (!s) return { text: "—", tone: "var(--ink-faint)" };
  if (s.status === "no-route") return { text: "No route", tone: "var(--danger)" };
  if (s.status === "unavailable") return { text: "Couldn't check", tone: "var(--ink-faint)" };
  const loss = s.lossPct ?? 0;
  if (loss < 0.01) return { text: "<0.01%", tone: "var(--grade-a)" };
  return { text: `${loss.toFixed(loss >= 10 ? 1 : 2)}%`, tone: loss >= 10 ? "var(--danger)" : loss >= 1 ? "var(--grade-c)" : "var(--grade-a)" };
}

function HoldingRow({ h }: { h: Holding }) {
  const flagged = needsAttention(h);
  const sell = sellLabel(h);
  const spec = h.variant.score.instrument.speculative;
  const units = h.amount >= 100 ? count(Math.round(h.amount)) : h.amount.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return (
    <Link
      href={`/asset/${encodeURIComponent(h.asset.assetId)}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-[var(--canvas)] md:grid-cols-[minmax(0,1fr)_100px_120px_110px_76px]"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AssetLogo src={h.variant.logoURI} name={h.asset.name} size={36} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{h.asset.name}</span>
            {spec && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
            {flagged && !spec && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>At risk</span>}
          </div>
          <span className="truncate text-[11px]" style={{ color: "var(--ink-faint)" }}>{h.variant.symbol} · {units} units</span>
          {h.why && flagged && <span className="truncate text-[11px]" style={{ color: "var(--danger)" }}>{h.why.headline}</span>}
          {h.valuation.stale && <span className="text-[11px]" style={{ color: "var(--grade-c)" }}>Valued at the real stock price — its own quote is stale</span>}
        </div>
      </div>
      <span className="hidden md:block"><Sparkline values={h.spark} /></span>
      <span className="font-display tabular text-right text-[14px] font-bold">{h.valuation.priceUsd == null ? "Unpriced" : usd(h.valueUsd)}</span>
      <span className="tabular hidden text-right text-[13px] font-semibold md:block" style={{ color: sell.tone }}>{sell.text}</span>
      <span className="col-start-2 row-start-1 text-right md:col-auto md:row-auto">
        <GradeBadge grade={h.variant.score.grade} score={h.variant.score.score} size="sm" />
      </span>
    </Link>
  );
}

function Changes({ signals }: { signals: Signal[] }) {
  const top = signals.slice(0, 5);
  if (top.length === 0) return null;
  const dot = (s: Signal) => (s.severity === "danger" ? "var(--danger)" : s.severity === "warn" ? "var(--grade-c)" : "var(--grade-a)");
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>For your holdings</span>
      <ul className="flex flex-col gap-2.5">
        {top.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot(s) }} />
            <span className="text-[12px] leading-snug" style={{ color: "var(--ink-soft)" }}>{s.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Loading() {
  const rows = useMemo(() => [0, 1, 2, 3], []);
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
        Reading the wallet and quoting what each holding would sell for right now…
      </span>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card-surface h-[300px] animate-pulse rounded-[16px]" />
        <div className="card-surface h-[140px] animate-pulse rounded-[16px]" />
      </div>
      <div className="card-surface flex flex-col gap-3 rounded-[16px] p-5">
        {rows.map((r) => <div key={r} className="h-10 animate-pulse rounded-[10px]" style={{ background: "var(--canvas)" }} />)}
      </div>
    </div>
  );
}
