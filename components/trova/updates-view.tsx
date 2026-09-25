"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Card } from "@/components/trova/shell";
import { useWalletAddress } from "@/components/trova/wallet";
import { api } from "@/lib/client";
import { count } from "@/lib/format";
import type { MarketRow, MonitoringStats, PortfolioSummary, Signal, SignalKind } from "@/lib/types";

type Filter = "all" | "holdings" | "watchlist" | "ownership" | "exit" | "new";

const OWNERSHIP: SignalKind[] = ["redemption-change", "advisory", "ownership-change"];
const EXIT: SignalKind[] = ["exit-change", "routability-change", "tier-change", "grade-change"];

const tone = (s: Signal) =>
  s.severity === "danger" ? { dot: "var(--danger)", line: "var(--danger-line)" }
  : s.severity === "warn" ? { dot: "var(--grade-c)", line: "var(--hairline)" }
  : { dot: "var(--grade-a)", line: "var(--hairline)" };

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const diff = Math.round((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function UpdatesView() {
  const address = useWalletAddress();
  const [filter, setFilter] = useState<Filter>("all");

  const universe = useQuery({
    queryKey: ["signals", 30],
    queryFn: () => api<{ signals: Signal[]; stats?: MonitoringStats; historyDays: number }>("/api/signals?days=30"),
    staleTime: 300_000,
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${address}`),
    enabled: !!address,
    staleTime: 60_000,
  });
  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ items: MarketRow[] }>("/api/watchlist", { device: true }),
    retry: false,
    staleTime: 60_000,
  });

  const heldMints = useMemo(() => new Set(portfolio.data?.holdings.map((h) => h.variant.mint) ?? []), [portfolio.data]);
  const watchedMints = useMemo(() => new Set(watchlist.data?.items.flatMap((i) => i.mints) ?? []), [watchlist.data]);

  const signals = useMemo(() => {
    const all = (universe.data?.signals ?? []).filter((s) => s.detectedAt);
    const pick = (s: Signal) =>
      filter === "all" ? true
      : filter === "holdings" ? !!s.mint && heldMints.has(s.mint)
      : filter === "watchlist" ? !!s.mint && watchedMints.has(s.mint)
      : filter === "ownership" ? OWNERSHIP.includes(s.kind)
      : filter === "exit" ? EXIT.includes(s.kind)
      : s.kind === "new-variant";
    return all.filter(pick).sort((a, b) => (b.detectedAt ?? 0) - (a.detectedAt ?? 0));
  }, [universe.data, filter, heldMints, watchedMints]);

  const groups = useMemo(() => {
    const out: { day: string; items: Signal[] }[] = [];
    for (const s of signals.slice(0, 120)) {
      const day = dayLabel(s.detectedAt!);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(s);
      else out.push({ day, items: [s] });
    }
    return out;
  }, [signals]);

  const chips: { key: Filter; label: string; disabled?: boolean }[] = [
    { key: "all", label: "Everything" },
    { key: "holdings", label: "Your holdings", disabled: !address },
    { key: "watchlist", label: "Watchlist", disabled: !watchlist.data?.items.length },
    { key: "ownership", label: "Ownership" },
    { key: "exit", label: "Exit" },
    { key: "new", label: "New tokens" },
  ];
  const stats = universe.data?.stats;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={c.disabled}
              onClick={() => setFilter(c.key)}
              title={c.disabled ? (c.key === "holdings" ? "Connect a wallet to see changes to what you hold" : "Star a company to follow it here") : undefined}
              className="whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-40"
              style={filter === c.key ? { background: "var(--ink)", color: "var(--surface)" } : { background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--hairline)" }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {universe.isPending || (filter === "holdings" && portfolio.isPending) ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="card-surface h-[72px] animate-pulse rounded-[16px]" />)
        ) : universe.isError ? (
          <Card className="p-5 text-[13px]"><span style={{ color: "var(--ink-soft)" }}>Updates are unavailable right now.</span></Card>
        ) : groups.length === 0 ? (
          <Card className="p-5 text-[13px]"><span style={{ color: "var(--ink-soft)" }}>Nothing has changed here in the last {universe.data.historyDays} days of daily checks.</span></Card>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="flex flex-col gap-2">
              <span className="eyebrow px-1 pt-2 font-bold">{g.day}</span>
              {g.items.map((s, i) => {
                const t = tone(s);
                const held = !!s.mint && heldMints.has(s.mint);
                return (
                  <Link
                    key={`${g.day}-${i}`}
                    href={s.assetId ? `/asset/${encodeURIComponent(s.assetId)}` : "#"}
                    className="flex items-start gap-3 rounded-[16px] p-4 transition-colors hover:bg-[var(--canvas)]"
                    style={{ background: "var(--surface)", border: `1px solid ${held ? t.line : "var(--hairline)"}` }}
                  >
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.dot }} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[13px] font-semibold leading-snug">{s.message}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {held && <Pill text="You hold this" color="var(--danger)" bg="var(--danger-bg)" />}
                        {!!s.mint && watchedMints.has(s.mint) && <Pill text="On your watchlist" color="var(--ink-soft)" bg="var(--canvas)" />}
                        {s.kind === "new-variant" && <Pill text="New" color="var(--grade-a)" bg="var(--grade-a-bg)" />}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))
        )}
      </div>

      <aside className="flex flex-col gap-4">
        {stats && (
          <Card className="flex flex-col gap-3 p-5">
            <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>This week, across everything</span>
            <Big n={stats.variantsTracked} label="tokens rated every day" />
            <Big n={stats.ratingsChangedAndHeld} label="ratings changed and held" />
            <Big n={stats.becameUntradable} label="stopped being tradable" tone="var(--danger)" />
            <Big n={stats.tierMoves} label="moved liquidity tier" />
            <Big n={stats.newVariants} label="new tokens" />
          </Card>
        )}
        <div className="rounded-[16px] p-5" style={{ background: "var(--surface)", border: "1px dashed var(--hairline)" }}>
          <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Why some things take three days</span>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            A rating or tradability change has to hold for three daily checks before it appears, so one quiet afternoon never becomes an alert. Changes to what you own — redemption terms, a warning from our sources — appear the same day.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color, background: bg }}>{text}</span>;
}

function Big({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-display tabular w-14 text-[24px] font-bold" style={{ color: tone }}>{count(n)}</span>
      <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{label}</span>
    </div>
  );
}
