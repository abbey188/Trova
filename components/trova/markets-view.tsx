"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { GradeBadge } from "@/components/trova/grade-badge";
import { AssetLogo } from "@/components/trova/search";
import { Card } from "@/components/trova/shell";
import { api } from "@/lib/client";
import { signedPercent, usd } from "@/lib/format";
import type { MarketRow, MarketsOverview } from "@/lib/types";

type Tab = "stocks" | "etfs" | "metals" | "private" | "watchlist";
type Sort = "rating" | "liquidity" | "move";

const TABS: { key: Tab; label: string }[] = [
  { key: "stocks", label: "Stocks" },
  { key: "etfs", label: "ETFs" },
  { key: "metals", label: "Metals" },
  { key: "private", label: "Private companies" },
  { key: "watchlist", label: "Watchlist" },
];

export function MarketsView() {
  const [tab, setTab] = useState<Tab>("stocks");
  const [sort, setSort] = useState<Sort>("rating");
  const [ratedOnly, setRatedOnly] = useState(true);

  const markets = useQuery({
    queryKey: ["markets"],
    queryFn: () => api<MarketsOverview>("/api/markets"),
    staleTime: 60_000,
  });
  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ items: MarketRow[] }>("/api/watchlist", { device: true }),
    retry: false,
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const m = markets.data;
    let list: MarketRow[] =
      tab === "watchlist" ? watchlist.data?.items ?? []
      : tab === "private" ? m?.privateCompanies ?? []
      : m?.lists.find((l) => l.list === tab)?.rows ?? [];
    // One row per company: curated lists can carry several issuers' listings of the same asset.
    const seen = new Set<string>();
    list = list.filter((r) => (seen.has(r.assetId) ? false : (seen.add(r.assetId), true)));
    if (ratedOnly && tab !== "watchlist") list = list.filter((r) => r.grade && r.grade !== "NR");
    const key = (r: MarketRow) =>
      sort === "rating" ? r.score ?? -1 : sort === "liquidity" ? r.liquidityUsd ?? -1 : Math.abs(r.priceChange24hPercent ?? 0);
    return [...list].sort((a, b) => key(b) - key(a));
  }, [markets.data, watchlist.data, tab, sort, ratedOnly]);

  const trending = (markets.data?.trending ?? []).filter((r) => r.grade).slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      {trending.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Trending on Solana</span>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {trending.map((r) => (
              <Link key={r.assetId} href={`/asset/${encodeURIComponent(r.assetId)}`} className="card-surface flex min-w-[180px] items-center gap-3 rounded-[14px] p-3">
                <AssetLogo src={r.logoUrl} name={r.name} size={30} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold">{r.symbol}</span>
                  <span className="tabular text-[11px]" style={{ color: (r.priceChange24hPercent ?? 0) >= 0 ? "var(--grade-a)" : "var(--grade-d)" }}>
                    {signedPercent(r.priceChange24hPercent, 1)}
                  </span>
                </div>
                <span className="ml-auto"><GradeBadge grade={r.grade!} score={r.score} size="sm" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Card className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-4 md:px-5">
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold"
                style={tab === t.key ? { background: "var(--ink)", color: "var(--surface)" } : { color: "var(--ink-soft)" }}
              >
                {t.label}
                {t.key === "watchlist" && watchlist.data ? ` ${watchlist.data.items.length}` : ""}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {tab !== "watchlist" && (
              <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-soft)" }}>
                <input type="checkbox" checked={ratedOnly} onChange={(e) => setRatedOnly(e.target.checked)} className="accent-[var(--ink)]" />
                Rated only
              </label>
            )}
            <label htmlFor="trova-sort" className="sr-only">Sort</label>
            <select id="trova-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-[10px] px-2 text-[12px] font-semibold" style={{ background: "var(--canvas)" }}>
              <option value="rating">Sort: rating</option>
              <option value="liquidity">Sort: liquidity</option>
              <option value="move">Sort: biggest move today</option>
            </select>
          </div>
        </div>

        {tab === "private" && (
          <p className="mx-4 mb-3 rounded-[12px] p-3 text-[12px] leading-relaxed md:mx-5" style={{ background: "var(--grade-c-bg)" }}>
            <b style={{ color: "var(--grade-c)" }}>Speculative. </b>
            Economic exposure to private companies through an SPV. The issuers state these confer no ownership, voting, dividend or information rights and may result in total loss. Ratings update as more information becomes public.
          </p>
        )}

        <div className="hidden grid-cols-[minmax(0,1fr)_110px_90px_110px_76px] gap-4 px-5 py-2 text-[11px] font-semibold md:grid" style={{ color: "var(--ink-faint)", borderTop: "1px solid var(--hairline)" }}>
          <span>Company</span><span className="text-right">Price</span><span className="text-right">24h</span><span className="text-right">Liquidity</span><span className="text-right">Rating</span>
        </div>

        {markets.isPending && tab !== "watchlist" ? (
          <div className="flex flex-col gap-2 p-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-11 animate-pulse rounded-[10px]" style={{ background: "var(--canvas)" }} />)}</div>
        ) : markets.isError && tab !== "watchlist" ? (
          <p className="p-5 text-[13px]" style={{ color: "var(--ink-soft)" }}>Markets are unavailable right now. Try again in a moment.</p>
        ) : tab === "watchlist" && watchlist.isError ? (
          <p className="p-5 text-[13px]" style={{ color: "var(--ink-soft)" }}>The watchlist isn&apos;t available in this browser.</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-[13px]" style={{ color: "var(--ink-soft)" }}>
            {tab === "watchlist" ? "Nothing watched yet. Star a company from its page and it appears here — kept on this device." : "Nothing to show here."}
          </p>
        ) : (
          rows.map((r) => (
            <Link
              key={r.assetId}
              href={`/asset/${encodeURIComponent(r.assetId)}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-[var(--canvas)] md:grid-cols-[minmax(0,1fr)_110px_90px_110px_76px] md:px-5"
              style={{ borderTop: "1px solid var(--hairline)" }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <AssetLogo src={r.logoUrl} name={r.name} size={34} />
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{r.name}</span>
                    {r.speculative && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span>}
                    {r.hasAdvisory && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>Warning</span>}
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>{r.symbol}{r.routable === false ? " · not tradable now" : ""}</span>
                </div>
              </div>
              <span className="font-display tabular hidden text-right text-[13px] font-semibold md:block">{usd(r.priceUsd)}</span>
              <span className="tabular hidden text-right text-[12px] font-semibold md:block" style={{ color: (r.priceChange24hPercent ?? 0) >= 0 ? "var(--grade-a)" : "var(--grade-d)" }}>
                {signedPercent(r.priceChange24hPercent, 1)}
              </span>
              <span className="tabular hidden text-right text-[12px] md:block" style={{ color: "var(--ink-soft)" }}>{usd(r.liquidityUsd, { compact: true })}</span>
              <span className="text-right">
                {r.grade ? <GradeBadge grade={r.grade} score={r.score} size="sm" /> : <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>unrated</span>}
              </span>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
