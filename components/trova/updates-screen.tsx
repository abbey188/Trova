"use client";

// Updates, as the UpdatesDesktop / ActivityMobile boards draw it: what changed in the tokens we
// rate, grouped by day, each change said plainly with why it counts. Past three of a kind in a day,
// the rest fold behind one button, so a bad day for thin tokens doesn't bury what you hold.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { HelpButton, ProfileAvatarButton } from "@/components/trova/frame";
import { CompanyLogo, DISPLAY, GradePill, Icon, NUM, Pill } from "@/components/trova/kit";
import { signalMeta, signalWhy } from "@/components/trova/signal-line";
import { swapFromHolding, toOption } from "@/components/trova/trade-sheet";
import { TradeTrigger } from "@/components/trova/trade-trigger";
import { useWalletAddress } from "@/components/trova/wallet";
import { api } from "@/lib/client";
import type { Holding, MarketRow, MarketsOverview, MonitoringStats, PortfolioSummary, Rating, Signal, SignalKind } from "@/lib/types";

type Filter = "all" | "holdings" | "watchlist" | "ownership" | "exit";

const OWNERSHIP: SignalKind[] = ["redemption-change", "advisory", "ownership-change", "new-variant"];
const EXIT: SignalKind[] = ["exit-change", "routability-change", "tier-change", "grade-change"];
const FOLD_AFTER = 3;

const RED = { color: "var(--danger)" } as const;
const tierN = (t?: string) => Number((t ?? "").replace(/\D/g, "")) || null;
const lostExit = (s: Signal) => (s.kind === "routability-change" && s.to === "not tradable") || (s.kind === "advisory" && s.to !== "none");

function dayLabel(ms: number) {
  const d = new Date(ms);
  const t = new Date();
  const diff = Math.round((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** The headline, the board's way: the key change in bold; red only for "you can't get out". */
function title(s: Signal): ReactNode {
  const sym = s.symbol ?? "";
  switch (s.kind) {
    case "routability-change":
      return s.to === "not tradable" ? <>{sym} <span style={RED}>stopped being tradable</span></> : <>{sym} is tradable again</>;
    case "tier-change": {
      const from = tierN(s.from), to = tierN(s.to);
      return <>{sym} moved {from != null && to != null && to < from ? "up" : "down"} to {s.to}</>;
    }
    case "grade-change": {
      const score = Number(/score (\d+)/.exec(s.message)?.[1]);
      if (s.to === "NR") return <>{sym} is <b>no longer rated</b> — too little is reported</>;
      const up = (s.from ?? "Z") > (s.to ?? "Z");
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{sym} {up ? "rose" : "fell"} from {s.from} to <GradePill grade={(s.to ?? "NR") as Rating} score={Number.isFinite(score) ? score : null} size="sm" /></span>;
    }
    case "exit-change": return <>{sym} exit score {s.from} → {s.to}</>;
    case "redemption-change": return <>{sym} redemption is now {s.to}</>;
    case "ownership-change": return <>{sym} is now {s.to}</>;
    case "advisory": return s.to === "none" ? <>{sym} warning lifted</> : <>{sym} <span style={RED}>warning: {s.to}</span></>;
    case "new-variant": return <>{sym} is newly tokenized</>;
    default: return s.message;
  }
}

export function UpdatesScreen() {
  const address = useWalletAddress();
  const [filter, setFilter] = useState<Filter>("all");
  const router = useRouter();
  // Home's "See all" lands here on Your holdings (?f=holdings).
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("f");
    if (f === "holdings" || f === "watchlist" || f === "ownership" || f === "exit") setFilter(f);
  }, []);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const universe = useQuery({ queryKey: ["signals", 30], queryFn: () => api<{ signals: Signal[]; stats?: MonitoringStats; historyDays: number }>("/api/signals?days=30"), staleTime: 300_000 });
  // No wallet means the demo portfolio (flow rule), so "Your holdings" always has something to show.
  const wallet = address ?? "demo";
  const portfolio = useQuery({ queryKey: ["portfolio", wallet], queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${wallet}`), staleTime: 60_000 });
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: () => api<{ items: MarketRow[] }>("/api/watchlist", { device: true }), retry: false, staleTime: 60_000 });
  const markets = useQuery({ queryKey: ["markets"], queryFn: () => api<MarketsOverview>("/api/markets"), staleTime: 300_000 });

  const held = useMemo(() => new Map((portfolio.data?.holdings ?? []).map((h) => [h.variant.mint, h])), [portfolio.data]);
  const watched = useMemo(() => new Set(watchlist.data?.items.flatMap((i) => i.mints) ?? []), [watchlist.data]);
  const companies = useMemo(() => {
    const m = new Map<string, { name: string; logoUrl: string | null }>();
    for (const r of [...(markets.data?.lists.flatMap((l) => l.rows) ?? []), ...(markets.data?.privateCompanies ?? [])]) if (!m.has(r.assetId)) m.set(r.assetId, { name: r.name, logoUrl: r.logoUrl });
    return m;
  }, [markets.data]);

  const signals = useMemo(() => {
    const pick = (s: Signal) =>
      filter === "all" ? true
      : filter === "holdings" ? !!s.mint && held.has(s.mint)
      : filter === "watchlist" ? !!s.mint && watched.has(s.mint)
      : filter === "ownership" ? OWNERSHIP.includes(s.kind)
      : EXIT.includes(s.kind);
    // Within a day, what you hold comes first, then what you watch.
    const rank = (s: Signal) => (s.mint && held.has(s.mint) ? 0 : s.mint && watched.has(s.mint) ? 1 : 2);
    return (universe.data?.signals ?? []).filter((s) => s.detectedAt && pick(s))
      .sort((a, b) => (b.detectedAt! - a.detectedAt!) || rank(a) - rank(b));
  }, [universe.data, filter, held, watched]);

  const groups = useMemo(() => {
    const out: { day: string; shown: Signal[]; folded: { key: string; kind: SignalKind; items: Signal[] }[] }[] = [];
    for (const s of signals) {
      const day = dayLabel(s.detectedAt!);
      let g = out.at(-1);
      if (!g || g.day !== day) out.push((g = { day, shown: [], folded: [] }));
      const mine = !!s.mint && (held.has(s.mint) || watched.has(s.mint));
      const sameKind = g.shown.filter((x) => x.kind === s.kind && !(x.mint && (held.has(x.mint) || watched.has(x.mint)))).length;
      if (mine || sameKind < FOLD_AFTER) g.shown.push(s);
      else {
        let f = g.folded.find((x) => x.kind === s.kind);
        if (!f) g.folded.push((f = { key: `${day}-${s.kind}`, kind: s.kind, items: [] }));
        f.items.push(s);
      }
    }
    // Folding a single change saves nothing — show it.
    for (const g of out) {
      for (const f of g.folded.filter((x) => x.items.length === 1)) g.shown.push(f.items[0]);
      g.folded = g.folded.filter((x) => x.items.length > 1);
    }
    return out;
  }, [signals, held, watched]);

  const stats = universe.data?.stats;
  const chips: { key: Filter; label: string; short: string }[] = [
    { key: "all", label: "Everything", short: "All" },
    { key: "holdings", label: "Your holdings", short: "Yours" },
    { key: "watchlist", label: "Watchlist", short: "Watchlist" },
    { key: "ownership", label: "Ownership", short: "Ownership" },
    { key: "exit", label: "Exit", short: "Exit" },
  ];
  const chipStyle = (on: boolean, compact: boolean) => ({
    display: "inline-flex", borderRadius: 999, whiteSpace: "nowrap" as const, cursor: "pointer", fontFamily: "inherit",
    padding: compact ? "8px 15px" : "9px 17px", fontSize: compact ? 12 : 13, fontWeight: on ? 700 : 600,
    background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--surface)" : "var(--ink-soft)", border: on ? "1px solid var(--ink)" : "1px solid var(--hairline)",
  });

  const loading = universe.isPending || (filter === "holdings" && portfolio.isPending) || (filter === "watchlist" && watchlist.isPending);
  const emptyText =
    filter === "holdings" ? `Nothing you hold has changed in the last ${universe.data?.historyDays ?? 30} days of daily checks.`
    : filter === "watchlist" ? (watched.size ? "Nothing on your watchlist has changed recently." : "Star a company on its page to follow its changes here.")
    : `Nothing has changed here in the last ${universe.data?.historyDays ?? 30} days of daily checks.`;

  const holdingOf = (s: Signal): Holding | undefined => (s.mint ? held.get(s.mint) : undefined);
  const hrefOf = (s: Signal) => `/asset/${encodeURIComponent(s.assetId ?? "")}${s.mint && held.has(s.mint) ? `?held=${s.mint}` : ""}`;
  const nameOf = (s: Signal) => companies.get(s.assetId ?? "")?.name ?? s.symbol ?? "";
  const logo = (s: Signal, size: number) => <CompanyLogo src={companies.get(s.assetId ?? "")?.logoUrl} name={nameOf(s)} id={s.assetId} size={size} />;
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  function tag(s: Signal) {
    if (s.mint && held.has(s.mint)) return <Pill tone={lostExit(s) ? "danger" : "neutral"}>You hold this</Pill>;
    if (s.mint && watched.has(s.mint)) return <Pill>On your watchlist</Pill>;
    if (s.kind === "new-variant") return <Pill tone="good">New</Pill>;
    return null;
  }

  function Article({ s }: { s: Signal }) {
    const h = holdingOf(s);
    const better = h?.betterVariant;
    const canMove = !!address && !!h && !!better && h.rawAmount != null && h.decimals != null;
    const alarm = !!h && lostExit(s);
    return (
      <article onClick={() => s.assetId && router.push(hrefOf(s))} className="hover:bg-[var(--canvas)]" style={{ cursor: s.assetId ? "pointer" : "default",  background: "var(--surface)", border: `1px solid ${alarm ? "var(--danger-line)" : "var(--hairline)"}`, borderRadius: 16, padding: "17px 19px", display: "flex", gap: 15 }}>
        {logo(s, 42)}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flexGrow: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{title(s)}</span>
            {tag(s)}
          </div>
          <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>{signalWhy(s)}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
            {canMove && (
              <TradeTrigger label={`Move to ${better!.symbol}`} variant="inline" assetName={h!.asset.name} options={[toOption(better!)]} defaultMint={better!.mint}
                from={swapFromHolding(h!)} assetId={h!.asset.assetId} logoUrl={h!.asset.logoUrl} />
            )}
            {s.assetId && <Link href={hrefOf(s)} onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 12px", borderRadius: 9, fontSize: 12, fontWeight: 700, color: "var(--grade-a)", background: "var(--grade-a-bg)", textDecoration: "none" }}>Open {nameOf(s)} {Icon.chevronRight(12)}</Link>}
            <span style={{ flexGrow: 1 }} />
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{signalMeta(s).split(" · ")[0]}</span>
          </div>
        </div>
      </article>
    );
  }

  function Row({ s }: { s: Signal }) {
    const tagged = tag(s);
    return (
      <Link href={s.assetId ? hrefOf(s) : "#"} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: 15, padding: "13px 15px", textDecoration: "none", color: "inherit", border: `1px solid ${holdingOf(s) && lostExit(s) ? "var(--danger-line)" : "transparent"}` }}>
        {logo(s, 38)}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{title(s)}</span>
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{signalMeta(s)}</span>
          {tagged && <span>{tagged}</span>}
        </div>
        <span style={{ flexGrow: 1 }} />
        {Icon.chevronRight(15, "var(--ink-faint)")}
      </Link>
    );
  }

  function Fold({ f, compact }: { f: { key: string; kind: SignalKind; items: Signal[] }; compact: boolean }) {
    const isOpen = open.has(f.key);
    const label =
      f.kind === "routability-change" ? "stopped being tradable" : f.kind === "grade-change" ? "ratings changed" : f.kind === "tier-change" ? "moved liquidity tier" : f.kind === "new-variant" ? "newly tokenized" : "more changes";
    return (
      <>
        <button type="button" onClick={() => toggle(f.key)} aria-expanded={isOpen}
          style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px dashed var(--hairline)", borderRadius: compact ? 15 : 16, padding: compact ? "12px 15px" : "14px 19px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
          <div style={{ display: "flex" }}>
            {f.items.slice(0, 2).map((s, i) => <span key={i} style={{ marginLeft: i ? -8 : 0, borderRadius: 999, boxShadow: "0 0 0 2px var(--surface)" }}>{logo(s, 28)}</span>)}
            {f.items.length > 2 && <span style={{ ...NUM, marginLeft: -8, width: 28, height: 28, borderRadius: 999, background: "var(--track)", boxShadow: "0 0 0 2px var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--ink-soft)" }}>+{f.items.length - 2}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{f.items.length} more {label}</span>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>grouped after {FOLD_AFTER} of a kind</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <span style={{ transform: isOpen ? "rotate(180deg)" : undefined, color: "var(--ink-faint)", display: "flex" }}>{Icon.chevronDown(15)}</span>
        </button>
        {isOpen && f.items.map((s, i) => (compact ? <Row key={i} s={s} /> : <Article key={i} s={s} />))}
      </>
    );
  }

  const dayHead = (d: string) => <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, padding: "8px 2px 0" }}>{d}</span>;
  const skeleton = (h: number) => [0, 1, 2, 3].map((i) => <div key={i} className="animate-pulse" style={{ height: h, borderRadius: 16, background: "var(--surface)" }} />);
  const note = (text: string) => <p style={{ margin: 0, padding: 18, fontSize: 13, color: "var(--ink-soft)", background: "var(--surface)", borderRadius: 16 }}>{text}</p>;

  return (
    <>
      {/* ---------------------------------------------------------------- desktop */}
      <header className="hidden lg:flex" style={{ alignItems: "center", gap: 16, padding: "17px 26px", background: "var(--surface)", borderBottom: "1px solid var(--hairline)", position: "sticky", top: 0, zIndex: 30 }}>
        <h1 style={{ ...DISPLAY, margin: 0, fontSize: 18, fontWeight: 600 }}>Updates</h1>
        <span style={{ flexGrow: 1 }} />
        <ProfileAvatarButton />
      </header>
      <main className="hidden lg:flex" style={{ flexDirection: "column", gap: 14, padding: "18px 26px 22px" }}>
        <div style={{ display: "flex", gap: 7 }}>
          {chips.map((c) => <button key={c.key} type="button" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)} style={chipStyle(filter === c.key, false)}>{c.label}</button>)}
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? skeleton(110)
              : universe.isError ? note("Updates are unavailable right now. Try again in a moment.")
              : groups.length === 0 ? note(emptyText)
              : groups.map((g) => (
                <div key={g.day} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dayHead(g.day)}
                  {g.shown.map((s, i) => <Article key={i} s={s} />)}
                  {g.folded.map((f) => <Fold key={f.key} f={f} compact={false} />)}
                </div>
              ))}
          </div>
          <aside style={{ width: 330, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 92 }}>
            {stats && (
              <section style={{ background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 16, padding: "18px 20px" }}>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>Last {stats.historyDays} days, across {stats.variantsTracked} tokens</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 15 }}>
                  {([[stats.ratingsChangedAndHeld, "ratings changed and held", false], [stats.becameUntradable, "tokens you could no longer sell", true], [stats.tierMoves, "moved liquidity tier", false], [stats.newVariants, "newly tokenized", false]] as const).map(([n, l, red]) => (
                    <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                      <span style={{ ...NUM, fontSize: 26, fontWeight: 700, width: 42, color: red ? "var(--danger)" : undefined }}>{n}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{l}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section style={{ background: "var(--track)", borderRadius: 16, padding: "18px 20px" }}>
              <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>Why some things take three days</span>
              <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--ink-soft)" }}>
                A rating change has to hold for three daily snapshots before it appears here, so one quiet afternoon never becomes an alert. Changes to what you own — redemption terms, a warning from our sources — appear the same day.
              </p>
            </section>
          </aside>
        </div>
      </main>

      {/* ---------------------------------------------------------------- mobile */}
      <header className="lg:hidden" style={{ padding: "18px 18px 14px", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: 17, fontWeight: 600 }}>Updates</h1>
          <span style={{ flexGrow: 1 }} />
          <HelpButton />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 13, overflowX: "auto", scrollbarWidth: "none" }}>
          {chips.map((c) => <button key={c.key} type="button" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)} style={chipStyle(filter === c.key, true)}>{c.short}</button>)}
        </div>
      </header>
      <main className="lg:hidden" style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? skeleton(70)
          : universe.isError ? note("Updates are unavailable right now. Try again in a moment.")
          : groups.length === 0 ? note(emptyText)
          : groups.map((g) => (
            <div key={g.day} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayHead(g.day)}
              {g.shown.map((s, i) => <Row key={i} s={s} />)}
              {g.folded.map((f) => <Fold key={f.key} f={f} compact />)}
            </div>
          ))}
      </main>
    </>
  );
}
