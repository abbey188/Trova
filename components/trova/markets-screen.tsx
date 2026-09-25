"use client";

// Markets, as the MarketsDesktop / MarketsMobile boards draw it: the watchlist as a chip with its
// count, then Stocks · ETFs · Metals · Private companies, sorted by rating; each row is a company —
// its logo, price, the real stock's 90 days, liquidity and the rating with its number.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { HelpButton, ProfileAvatarButton } from "@/components/trova/frame";
import { CompanyLogo, DISPLAY, GradePill, Icon, NUM, Pill, Spark } from "@/components/trova/kit";
import { SearchBox } from "@/components/trova/search";
import { api } from "@/lib/client";
import { usd } from "@/lib/format";
import type { MarketRow, MarketsOverview } from "@/lib/types";

type Tab = "watchlist" | "stocks" | "etfs" | "metals" | "private";
type Sort = "rating" | "liquidity" | "price";

const TABS: { key: Exclude<Tab, "watchlist">; label: string; short: string }[] = [
  { key: "stocks", label: "Stocks", short: "Stocks" },
  { key: "etfs", label: "ETFs", short: "ETFs" },
  { key: "metals", label: "Metals", short: "Metals" },
  { key: "private", label: "Private companies", short: "Private" },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: "rating", label: "rating" },
  { key: "liquidity", label: "liquidity" },
  { key: "price", label: "price" },
];
const PAGE = 40;

function chip(on: boolean, compact: boolean) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, whiteSpace: "nowrap" as const, cursor: "pointer",
    padding: compact ? "8px 15px" : "9px 17px", fontSize: compact ? 12 : 13, fontWeight: on ? 700 : 600, fontFamily: "inherit",
    background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--surface)" : "var(--ink-soft)",
    border: on ? "1px solid var(--ink)" : "1px solid var(--hairline)",
  };
}

export function MarketsScreen() {
  const [tab, setTab] = useState<Tab>("stocks");
  const [sort, setSort] = useState<Sort>("rating");
  const [shown, setShown] = useState(PAGE);

  const markets = useQuery({ queryKey: ["markets"], queryFn: () => api<MarketsOverview>("/api/markets"), staleTime: 60_000 });
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: () => api<{ items: MarketRow[] }>("/api/watchlist", { device: true }), retry: false, staleTime: 60_000 });

  const all = useMemo(() => {
    const m = markets.data;
    let list: MarketRow[] =
      tab === "watchlist" ? watchlist.data?.items ?? []
      : tab === "private" ? m?.privateCompanies ?? []
      : m?.lists.find((l) => l.list === tab)?.rows ?? [];
    // One row per company: a curated list can carry several issuers' listings of the same asset.
    const seen = new Set<string>();
    list = list.filter((r) => (seen.has(r.assetId) ? false : (seen.add(r.assetId), true)));
    // Unrated rows go last, never mixed in as if they were bad ratings.
    const key = (r: MarketRow) => (sort === "rating" ? r.score ?? -1 : sort === "liquidity" ? r.liquidityUsd ?? -1 : r.priceUsd ?? -1);
    return [...list].sort((a, b) => key(b) - key(a));
  }, [markets.data, watchlist.data, tab, sort]);
  const rows = all.slice(0, shown);

  // The real stock's 90 days, for the rows on screen. Private companies have no listed share.
  const tickers = rows.filter((r) => !r.speculative).map((r) => r.symbol.toUpperCase()).filter((t) => /^[A-Z0-9.]{1,12}$/.test(t));
  const spark = useQuery({
    queryKey: ["spark", tickers.join(",")],
    queryFn: async () => {
      const out: Record<string, number[] | null> = {};
      for (let i = 0; i < tickers.length; i += 40) {
        const r = await api<{ series: Record<string, number[] | null> }>(`/api/spark?t=${tickers.slice(i, i + 40).join(",")}`);
        Object.assign(out, r.series);
      }
      return out;
    },
    enabled: tickers.length > 0,
    staleTime: 3_600_000,
  });
  const sparkOf = (r: MarketRow) => spark.data?.[r.symbol.toUpperCase()] ?? null;

  const watchCount = watchlist.data?.items.length ?? null;
  const pick = (t: Tab) => { setTab(t); setShown(PAGE); };
  const cycleSort = () => setSort((s) => SORTS[(SORTS.findIndex((x) => x.key === s) + 1) % SORTS.length].key);
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;

  const loading = tab === "watchlist" ? watchlist.isPending : markets.isPending;
  const failed = tab === "watchlist" ? watchlist.isError : markets.isError;
  const empty = !loading && !failed && rows.length === 0;
  const emptyText = tab === "watchlist"
    ? "Nothing watched yet. Tap the star on a company's page and it shows here — kept on this device, no wallet needed."
    : "Nothing to show here.";

  const privateNote = (
    <p style={{ margin: 0, borderRadius: 12, padding: "10px 13px", fontSize: 12, lineHeight: 1.5, background: "var(--grade-c-bg)", color: "var(--ink)" }}>
      <b style={{ color: "var(--grade-c)" }}>Speculative. </b>
      Exposure to a private company through an SPV. The issuers state these give no ownership, voting, dividend or information rights and may result in total loss. Ratings update as information becomes public.
    </p>
  );

  return (
    <>
      {/* ---------------------------------------------------------------- desktop */}
      <header className="hidden lg:flex" style={{ alignItems: "center", gap: 16, padding: "17px 26px", background: "var(--surface)", borderBottom: "1px solid var(--hairline)", position: "sticky", top: 0, zIndex: 30 }}>
        <h1 style={{ ...DISPLAY, margin: 0, fontSize: 18, fontWeight: 600 }}>Markets</h1>
        <span style={{ flexGrow: 1 }} />
        <SearchBox className="w-[300px]" />
        <ProfileAvatarButton />
      </header>
      <main className="hidden lg:flex" style={{ flexDirection: "column", gap: 13, padding: "16px 26px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <button type="button" onClick={() => pick("watchlist")} aria-pressed={tab === "watchlist"} style={chip(tab === "watchlist", false)}>
            {Icon.star(14)} Watchlist {watchCount != null && <span style={{ color: tab === "watchlist" ? "inherit" : "var(--ink-faint)", opacity: tab === "watchlist" ? 0.7 : 1 }}>{watchCount}</span>}
          </button>
          <span style={{ width: 6 }} />
          {TABS.map((t) => <button key={t.key} type="button" onClick={() => pick(t.key)} aria-pressed={tab === t.key} style={chip(tab === t.key, false)}>{t.label}</button>)}
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={cycleSort} style={{ ...chip(false, false), fontSize: 12, padding: "9px 15px" }}>Sort: {sortLabel} {Icon.chevronDown(13)}</button>
        </div>
        {tab === "private" && privateNote}
        <section style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[["Company", "left", "13px 20px 10px"], ["Price", "right", "13px 8px 10px"], ["90 days", "left", "13px 8px 10px 22px"], ["Liquidity", "right", "13px 8px 10px"], ["Rating", "right", "13px 20px 10px"]].map(([h, a, pad]) => (
                  <th key={h} scope="col" style={{ textAlign: a as "left" | "right", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, padding: pad }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? [0, 1, 2, 3, 4, 5].map((i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--track)" }}><td colSpan={5} style={{ padding: "11px 20px" }}><div className="animate-pulse" style={{ height: 34, borderRadius: 10, background: "var(--track)" }} /></td></tr>
              )) : rows.map((r) => (
                <tr key={r.assetId} className="hover:bg-[var(--canvas)]" style={{ borderTop: "1px solid var(--track)" }}>
                  <td style={{ padding: "11px 20px" }}>
                    <Link href={`/asset/${encodeURIComponent(r.assetId)}`} style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: "inherit" }}>
                      <CompanyLogo src={r.logoUrl} name={r.name} id={r.assetId} size={34} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
                          {r.name}
                          {r.speculative && <Pill tone="warn">Speculative</Pill>}
                          {r.hasAdvisory && <Pill tone="danger">Warning</Pill>}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{r.symbol}{r.speculative ? " · private" : ""}{r.routable === false ? " · not tradable now" : ""}</span>
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: "11px 8px", textAlign: "right" }}><span style={{ ...NUM, fontSize: 13, fontWeight: 600 }}>{usd(r.priceUsd)}</span></td>
                  <td style={{ padding: "11px 8px 11px 22px" }}><Spark values={sparkOf(r)} width={120} height={30} muted={r.routable === false} /></td>
                  <td style={{ padding: "11px 8px", textAlign: "right" }}><span style={{ ...NUM, fontSize: 13, fontWeight: 600 }}>{usd(r.liquidityUsd, { compact: true })}</span></td>
                  <td style={{ padding: "11px 20px", textAlign: "right" }}>
                    {r.grade ? <GradePill grade={r.grade} score={r.score} /> : <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Not rated</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {failed && <p style={{ margin: 0, padding: 20, fontSize: 13, color: "var(--ink-soft)" }}>{tab === "watchlist" ? "The watchlist isn't available in this browser." : "Markets are unavailable right now. Try again in a moment."}</p>}
          {empty && <p style={{ margin: 0, padding: 20, fontSize: 13, color: "var(--ink-soft)" }}>{emptyText}</p>}
          {all.length > shown && <MoreButton onClick={() => setShown((n) => n + PAGE)} left={all.length - shown} />}
        </section>
      </main>

      {/* ---------------------------------------------------------------- mobile */}
      <header className="lg:hidden" style={{ padding: "18px 18px 14px", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: 17, fontWeight: 600 }}>Markets</h1>
          <span style={{ flexGrow: 1 }} />
          <HelpButton />
        </div>
        <SearchBox large className="mt-[13px]" />
        <div style={{ display: "flex", gap: 6, marginTop: 13, overflowX: "auto", scrollbarWidth: "none" }}>
          <button type="button" onClick={() => pick("watchlist")} aria-pressed={tab === "watchlist"} aria-label="Watchlist" style={{ ...chip(tab === "watchlist", true), gap: 5, padding: "8px 13px" }}>
            {Icon.star(13)}{watchCount ?? ""}
          </button>
          {TABS.map((t) => <button key={t.key} type="button" onClick={() => pick(t.key)} aria-pressed={tab === t.key} style={chip(tab === t.key, true)}>{t.short}</button>)}
        </div>
      </header>
      <main className="lg:hidden" style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 4px 2px" }}>
          <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>Sorted by {sortLabel}</span>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={cycleSort} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "var(--ink-soft)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
            {sortLabel} {Icon.chevronDown(12)}
          </button>
        </div>
        {tab === "private" && privateNote}
        {loading && [0, 1, 2, 3, 4].map((i) => <div key={i} className="animate-pulse" style={{ height: 64, borderRadius: 15, background: "var(--surface)" }} />)}
        {rows.map((r) => (
          <Link key={r.assetId} href={`/asset/${encodeURIComponent(r.assetId)}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: 15, padding: "13px 15px", textDecoration: "none", color: "inherit" }}>
            <CompanyLogo src={r.logoUrl} name={r.name} id={r.assetId} size={38} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ fontSize: 11, color: r.speculative ? "var(--grade-c)" : "var(--ink-faint)", fontWeight: r.speculative ? 600 : 400 }}>{r.symbol}{r.speculative ? " · Speculative" : ""}</span>
            </div>
            <span style={{ flexGrow: 1 }} />
            <Spark values={sparkOf(r)} width={58} height={24} muted={r.routable === false} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{usd(r.priceUsd)}</span>
              {r.grade ? <GradePill grade={r.grade} score={r.score} size="sm" /> : <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>Not rated</span>}
            </div>
          </Link>
        ))}
        {failed && <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--ink-soft)" }}>{tab === "watchlist" ? "The watchlist isn't available in this browser." : "Markets are unavailable right now. Try again in a moment."}</p>}
        {empty && <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--ink-soft)", background: "var(--surface)", borderRadius: 15 }}>{emptyText}</p>}
        {all.length > shown && <MoreButton onClick={() => setShown((n) => n + PAGE)} left={all.length - shown} rounded />}
      </main>
    </>
  );
}

function MoreButton({ onClick, left, rounded }: { onClick: () => void; left: number; rounded?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{ width: "100%", padding: "13px 0", fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", background: "var(--surface)", border: "none", borderTop: rounded ? "none" : "1px solid var(--track)", borderRadius: rounded ? 15 : 0, cursor: "pointer", fontFamily: "inherit" }}>
      Show {Math.min(left, PAGE)} more · {left} left
    </button>
  );
}
