"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CompanyLogo, GradePill, Icon } from "@/components/trova/kit";
import { api, isAddress } from "@/lib/client";
import type { MarketRow } from "@/lib/types";

/** Search a stock by name or ticker — or paste any wallet address to look at it, read-only. */
export function SearchBox({ className = "", large }: { className?: string; large?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const wallet = isAddress(debounced) ? debounced : null;
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<{ results: MarketRow[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2 && !wallet,
    staleTime: 120_000,
  });
  const results = (data?.results ?? []).slice(0, 7);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <label htmlFor="trova-search" className="sr-only">Search a stock or paste a wallet</label>
      <div className="flex items-center gap-[9px]" style={{ background: "var(--canvas)", borderRadius: large ? 13 : 11, padding: large ? "0 14px" : "0 15px", height: large ? 46 : 42, color: "var(--ink-faint)" }}>
        {Icon.search(16)}
        <input
          id="trova-search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && wallet) { setOpen(false); router.push(`/p/${wallet}`); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search a stock"
          autoComplete="off"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--ink-faint)]" style={{ color: "var(--ink)" }}
        />
      </div>
      {open && debounced.length >= 2 && (
        <div
          className="absolute left-0 right-0 z-50 mt-2 flex max-h-[420px] flex-col overflow-auto rounded-[14px] p-1.5"
          style={{ background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 12px 32px rgba(20,22,26,0.14)" }}
        >
          {wallet ? (
            <Link href={`/p/${wallet}`} onClick={() => setOpen(false)} className="flex flex-col gap-0.5 rounded-[10px] px-3 py-2.5 hover:bg-[var(--canvas)]">
              <span className="text-[13px] font-semibold">Look at this wallet</span>
              <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>Read-only, from its public address. Nothing to sign.</span>
            </Link>
          ) : results.length === 0 ? (
            <span className="px-3 py-3 text-[12px]" style={{ color: "var(--ink-soft)" }}>
              {isFetching ? "Searching…" : `Nothing tokenized matches “${debounced}”.`}
            </span>
          ) : (
            results.map((r) => (
              <Link
                key={r.assetId}
                href={`/asset/${encodeURIComponent(r.assetId)}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[10px] px-3 py-2 hover:bg-[var(--canvas)]"
              >
                <CompanyLogo src={r.logoUrl} name={r.name} id={r.assetId} size={30} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold">{r.name}</span>
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>{r.symbol}{r.speculative ? " · Speculative" : ""}</span>
                </div>
                <span className="ml-auto">
                  {r.grade ? <GradePill grade={r.grade} score={r.score} size="sm" /> : <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>unrated</span>}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
