"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/client";
import type { MarketRow } from "@/lib/types";

/** Star an asset. The watchlist lives on this device — no wallet, no signature. */
export function WatchButton({ assetId }: { assetId: string }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ items: MarketRow[] }>("/api/watchlist", { device: true }),
    retry: false,
    staleTime: 60_000,
  });
  const watching = list.data?.items.some((i) => i.assetId === assetId) ?? false;
  const toggle = useMutation({
    mutationFn: () =>
      watching
        ? api(`/api/watchlist?assetId=${encodeURIComponent(assetId)}`, { method: "DELETE", device: true })
        : api("/api/watchlist", { method: "POST", device: true, body: JSON.stringify({ assetId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  if (list.isError) return null; // storage unavailable: no button rather than a broken one

  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending || list.isPending}
      aria-pressed={watching}
      className="inline-flex h-10 items-center gap-2 rounded-[11px] px-4 text-[13px] font-semibold disabled:opacity-60"
      style={{ border: "1px solid var(--hairline)", color: "var(--ink)", background: watching ? "var(--canvas)" : "var(--surface)" }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill={watching ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.9 9.1 9z" /></svg>
      {watching ? "Watching" : "Watchlist"}
    </button>
  );
}

interface Rung { usdSize: number; status: "ok" | "no-route" | "unavailable"; roundTripPct: number | null }

/** What getting in and back out costs at three sizes — quoted through Jupiter when you open the page. */
export function ExitLadder({ mint }: { mint: string }) {
  const q = useQuery({
    queryKey: ["exit", mint],
    queryFn: () => api<{ ladder: Rung[] }>(`/api/exit?mint=${mint}`),
    staleTime: 120_000,
  });
  const rungs = q.data?.ladder ?? [];
  const worst = Math.max(2, ...rungs.map((r) => r.roundTripPct ?? 0));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline">
        <span className="text-[13px] font-semibold">What it costs to leave</span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--ink-faint)" }}>{q.isFetching ? "quoting…" : "quoted just now"}</span>
      </div>
      {q.isPending ? (
        [0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded-[8px]" style={{ background: "var(--canvas)" }} />)
      ) : q.isError ? (
        <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>Couldn&apos;t reach Jupiter just now — this says nothing about whether you can sell.</span>
      ) : (
        rungs.map((r) => {
          const pct = r.roundTripPct;
          const tone = r.status !== "ok" ? "var(--danger)" : (pct ?? 0) >= 10 ? "var(--danger)" : (pct ?? 0) >= 1 ? "var(--grade-c)" : "var(--grade-a)";
          return (
            <div key={r.usdSize} className="grid grid-cols-[72px_1fr_64px] items-center gap-3">
              <span className="tabular text-[12px] font-semibold">${r.usdSize.toLocaleString("en-US")}</span>
              <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
                <div className="h-full rounded-full" style={{ width: r.status === "ok" ? `${Math.max(3, ((pct ?? 0) / worst) * 100)}%` : "100%", background: tone }} />
              </div>
              <span className="tabular text-right text-[12px] font-bold" style={{ color: tone }}>
                {r.status === "ok" ? `${(pct ?? 0).toFixed(2)}%` : r.status === "no-route" ? "No route" : "—"}
              </span>
            </div>
          );
        })
      )}
      <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>Bought with USDC and sold straight back. Measured, not estimated.</span>
    </div>
  );
}
