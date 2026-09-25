"use client";

// Home — ported from HomeDesktop / HomeMobile on the canvas. Desktop: a KPI row (value, score ring,
// needs-attention, speculative), the holdings table, Breakdown and Portfolio activity. Mobile: the
// stacked cards and the row list. The ⚠ count is a button that opens the attention sheet (flow map);
// tapping the avatar opens the profile sheet. With no wallet the same screen runs on the demo
// portfolio, badged — connecting swaps the data, not the layout.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Avatar, HelpButton, Sheet } from "@/components/trova/frame";
import { ArrowLink, CompanyLogo, DISPLAY, gradeOf, GradePill, Icon, Label, NUM, Panel, Pill, ScoreRing, Spark } from "@/components/trova/kit";
import { ProfileContent } from "@/components/trova/profile";
import { isChange, signalMeta, signalTitle } from "@/components/trova/signal-line";
import { NamePrompt } from "@/components/trova/name-prompt";
import { SearchBox } from "@/components/trova/search";
import { TradeTrigger } from "@/components/trova/trade-trigger";
import { swapFromHolding, toOption } from "@/components/trova/trade-sheet";
import { ConnectButton, useWalletAddress } from "@/components/trova/wallet";
import { api, shortAddress } from "@/lib/client";
import { usd } from "@/lib/format";
import type { Holding, PortfolioSummary, Signal } from "@/lib/types";

const RANGES = [["1W", 7], ["1M", 30], ["3M", 90], ["1Y", 365]] as const;
type RangeKey = (typeof RANGES)[number][0];

/** At risk: the rating flags it, or the live sale does — no route, or 10%+ lost selling now. */
function flagged(h: Holding) {
  const s = h.variant.score;
  const sale = h.sellNow;
  return !s.routable || !s.rated || s.grade === "D" || s.advisory != null
    || sale?.status === "no-route" || (sale?.status === "ok" && (sale.lossPct ?? 0) >= 10);
}

export const optionOf = toOption;

/** A holding opens its company's page in the context of the token you hold. */
const heldHref = (h: Holding) => `/asset/${encodeURIComponent(h.asset.assetId)}?held=${h.variant.mint}`;

function units(n: number) {
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** "If sold today": what selling the whole balance gives up, measured. Red only when you can't get out. */
function sell(h: Holding): { text: string; color: string } {
  const s = h.sellNow;
  if (!s) return { text: "—", color: "var(--ink-faint)" };
  if (s.status === "no-route") return { text: "No route", color: "var(--danger)" };
  if (s.status === "unavailable") return { text: "—", color: "var(--ink-faint)" };
  const l = s.lossPct ?? 0;
  if (l < 0.01) return { text: "<0.01%", color: h.variant.score.instrument.speculative ? "var(--grade-c)" : "var(--grade-a)" };
  return { text: `${l.toFixed(l >= 10 ? 1 : 2)}%`, color: l >= 10 ? "var(--danger)" : l >= 1 ? "var(--grade-c)" : "var(--grade-a)" };
}

// ---------------------------------------------------------------------------------------------

export function HomeScreen({ address }: { address: string }) {
  const connected = useWalletAddress();
  const demo = address === "demo";
  const mine = !demo && connected === address;
  const [range, setRange] = useState<RangeKey>("1Y");
  const [attention, setAttention] = useState(false);
  const [profile, setProfile] = useState(false);

  const q = useQuery({ queryKey: ["portfolio", address], queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${address}`), staleTime: 60_000 });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ nickname: string | null }>("/api/me", { device: true }), enabled: mine, retry: false });
  const nickname = mine ? me.data?.nickname ?? null : null;

  const p = q.data;
  const series = useMemo(() => {
    const pts = p?.valueHistory?.points ?? [];
    const days = RANGES.find(([k]) => k === range)![1];
    const cutoff = (pts.at(-1)?.time ?? 0) - days * 86_400;
    return pts.filter((x) => x.time >= cutoff);
  }, [p, range]);

  const greeting = demo ? "Demo portfolio" : mine ? (nickname ? `Welcome back, ${nickname}` : "Welcome back") : `Wallet ${shortAddress(address)}`;
  const attentionRows = (p?.holdings ?? []).filter((h) => h.valueUsd > 0 && flagged(h));

  const header = (
    <>
      {mine && me.isSuccess && !me.data?.nickname && <NamePrompt address={address} />}
      {/* desktop header */}
      <header className="hidden lg:flex" style={{ alignItems: "center", gap: 16, padding: "17px 26px", background: "var(--surface)", borderBottom: "1px solid var(--hairline)", position: "sticky", top: 0, zIndex: 30 }}>
        <button type="button" onClick={() => setProfile(true)} aria-label="Profile" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", borderRadius: 999 }}>
          <Avatar size={40} name={demo || mine ? undefined : null} address={demo ? null : address} />
        </button>
        <span style={{ ...DISPLAY, fontSize: 18, fontWeight: 600 }}>{greeting}</span>
        {demo && <DemoBadge />}
        {!demo && !mine && <Pill>Read-only</Pill>}
        <span style={{ flexGrow: 1 }} />
        <SearchBox className="w-[280px]" />
        <Link href="/updates" aria-label="Updates" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, border: "1px solid var(--hairline)", borderRadius: 12, background: "var(--surface)", color: "var(--ink-soft)" }}>
          {Icon.bell()}
          {(p?.signals ?? []).some((s) => s.severity !== "info") && <span style={{ position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 999, background: "var(--danger)", border: "1.5px solid var(--surface)" }} />}
        </Link>
        {(demo || !connected) && <ConnectButton />}
      </header>
      {/* mobile header */}
      <header className="flex lg:hidden" style={{ alignItems: "center", gap: 11, padding: "18px 18px 15px", background: "var(--surface)" }}>
        <button type="button" onClick={() => setProfile(true)} aria-label="Profile" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", borderRadius: 999 }}>
          <Avatar size={40} name={demo || mine ? undefined : null} address={demo ? null : address} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 600 }}>{greeting}</span>
          {demo && <DemoBadge compact />}
        </div>
        <span style={{ flexGrow: 1 }} />
        <HelpButton />
      </header>
    </>
  );

  if (q.isPending) return (<>{header}<HomeSkeleton /></>);
  if (q.isError || !p) {
    return (
      <>
        {header}
        <div style={{ padding: 24 }}>
          <Panel style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 600 }}>We couldn&apos;t read this wallet just now</span>
            <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{q.error?.message}</span>
            <button type="button" onClick={() => q.refetch()} style={{ height: 42, padding: "0 18px", borderRadius: 11, border: "none", background: "var(--action)", color: "var(--action-ink)", fontWeight: 700, cursor: "pointer" }}>Try again</button>
          </Panel>
        </div>
      </>
    );
  }

  const total = p.totalValueUsd + p.cashValueUsd;
  const first = series[0]?.valueUsd ?? null;
  const last = series.at(-1)?.valueUsd ?? null;
  const change = first != null && last != null ? last - first : null;
  const changePct = change != null && first ? (change / first) * 100 : null;
  const ringScore = p.holdings.some((h) => h.variant.score.score != null) ? p.scores.overall : null;
  const specPct = total > 0 ? (p.speculativeUsd / total) * 100 : 0;

  const valueCard = (compact: boolean) => (
    <Panel style={{ padding: compact ? "18px 20px" : "16px 19px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Label>Portfolio value</Label>
        <span style={{ flexGrow: 1 }} />
        {RANGES.map(([k]) => (
          <button key={k} type="button" onClick={() => setRange(k)} aria-pressed={range === k} style={{ display: "inline-flex", borderRadius: 7, padding: "4px 8px", fontSize: 10, fontWeight: range === k ? 700 : 600, border: "none", cursor: "pointer", background: range === k ? "var(--ink)" : "transparent", color: range === k ? "var(--surface)" : "var(--ink-faint)" }}>{k}</button>
        ))}
      </div>
      <div style={{ ...NUM, fontSize: compact ? 34 : 30, fontWeight: 700, letterSpacing: compact ? -1.1 : -0.9, marginTop: compact ? 7 : 8 }}>{usd(total)}</div>
      <div style={{ display: "flex", alignItems: compact ? "stretch" : "flex-end", flexDirection: compact ? "column" : "row", gap: compact ? 12 : 10, marginTop: 6 }}>
        {change != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", color: change >= 0 ? "var(--grade-a)" : "var(--danger)" }}>
            {change >= 0 ? Icon.up() : Icon.down()}
            {usd(Math.abs(change))}{changePct != null ? ` · ${Math.abs(changePct).toFixed(1)}%` : ""} · today&apos;s holdings, {range}
          </span>
        )}
        {!compact && <span style={{ flexGrow: 1 }} />}
        <div style={{ flexShrink: 1, minWidth: 0, width: compact ? "100%" : 140 }}>
          <ValueLine points={series.map((x) => x.valueUsd)} width={140} height={compact ? 54 : 40} fluid />
        </div>
      </div>
    </Panel>
  );

  const scoreCard = (compact: boolean) => (
    <Panel style={{ padding: compact ? "15px 16px" : "14px 16px", display: "flex", alignItems: "center", gap: compact ? 12 : 13 }}>
      <ScoreRing score={ringScore} grade={ringScore == null ? "NR" : gradeOf(ringScore)} size={compact ? 66 : 80} />
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 7 : 8, minWidth: 0, flexGrow: 1 }}>
        <Label>Trova Portfolio Score</Label>
        <MiniBar label="Ownership" value={p.scores.ownership} />
        <MiniBar label="Exit" value={p.scores.exit} />
      </div>
    </Panel>
  );

  const attentionButton = (compact: boolean) =>
    p.needsAttentionUsd > 0 ? (
      <button type="button" onClick={() => setAttention(true)} style={{ background: "var(--danger-bg)", border: "none", borderRadius: compact ? 18 : 16, padding: compact ? "15px 18px" : "16px 19px", display: "flex", flexDirection: compact ? "row" : "column", alignItems: compact ? "center" : "stretch", gap: compact ? 12 : 0, textAlign: "left", cursor: "pointer", color: "var(--ink)", minHeight: 56, fontFamily: "inherit" }}>
        {!compact && <span style={{ fontSize: 11, color: "var(--danger-deep)", fontWeight: 700 }}>Needs attention</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ ...NUM, fontSize: compact ? 24 : 30, fontWeight: 700, letterSpacing: compact ? 0 : -0.9, marginTop: compact ? 0 : 7 }}>{usd(p.needsAttentionUsd)}</span>
          {compact && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger-deep)" }}>across {p.needsAttentionCount} holding{p.needsAttentionCount === 1 ? "" : "s"} that need attention</span>}
        </div>
        {!compact && <span style={{ flexGrow: 1 }} />}
        {!compact ? (
          <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger-deep)" }}>{p.needsAttentionCount} holding{p.needsAttentionCount === 1 ? "" : "s"}</span>
            <span style={{ flexGrow: 1 }} />
            {Icon.chevronRight(15, "var(--danger-deep)")}
          </span>
        ) : (
          <><span style={{ flexGrow: 1 }} />{Icon.chevronRight(17, "var(--danger-deep)")}</>
        )}
      </button>
    ) : (
      <Panel style={{ padding: "16px 19px", display: "flex", flexDirection: "column" }}>
        <Label>Needs attention</Label>
        <span style={{ ...NUM, fontSize: 30, fontWeight: 700, marginTop: 7, color: "var(--grade-a)" }}>None</span>
        <span style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 10 }}>every holding can be sold</span>
      </Panel>
    );

  const specCard = (
    <Panel style={{ padding: "16px 19px", display: "flex", flexDirection: "column" }}>
      <Label>Speculative</Label>
      <span style={{ ...NUM, fontSize: 30, fontWeight: 700, letterSpacing: -0.9, marginTop: 7 }}>{usd(p.speculativeUsd)}</span>
      <span style={{ flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <div style={{ flexGrow: 1, height: 6, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, specPct)}%`, height: 6, borderRadius: 999, background: "var(--amber-bar)" }} /></div>
        <span style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "var(--grade-c)" }}>{Math.round(specPct)}%</span>
      </div>
      <span style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 5 }}>private companies, via SPV</span>
    </Panel>
  );

  return (
    <>
      {header}

      {/* ---------------- desktop ---------------- */}
      <main className="hidden lg:flex" style={{ flexDirection: "column", gap: 14, padding: "18px 26px 26px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 1fr 1fr", gap: 14 }}>
          {valueCard(false)}
          {scoreCard(false)}
          {attentionButton(false)}
          {specCard}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <HoldingsTable p={p} canTrade={mine} />
          <aside style={{ width: 318, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <Breakdown p={p} />
            <Activity signals={p.signals} holdings={p.holdings} />
          </aside>
        </div>
      </main>

      {/* ---------------- mobile ---------------- */}
      <main className="flex lg:hidden" style={{ flexDirection: "column", gap: 11, padding: 14 }}>
        <SearchBox />
        {valueCard(true)}
        {scoreCard(true)}
        {p.needsAttentionUsd > 0 && attentionButton(true)}
        <div style={{ display: "flex", alignItems: "center", padding: "2px 4px" }}>
          <span style={{ ...DISPLAY, fontSize: 14, fontWeight: 600 }}>Holdings</span>
          <span style={{ flexGrow: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>by value</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {p.holdings.map((h) => <HoldingCard key={h.variant.mint} h={h} />)}
          {p.cash.filter((c) => (c.valueUsd ?? 0) > 0.5).map((c) => (
            <div key={c.mint} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: 15, padding: "13px 15px" }}>
              <span style={{ ...DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, background: "#2775CA", color: "#fff", fontSize: 13, fontWeight: 700 }}>$</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 13, fontWeight: 600 }}>Cash</span><span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.symbol}</span></div>
              <span style={{ flexGrow: 1 }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{usd(c.valueUsd)}</span>
                <span style={{ fontSize: 10, color: "var(--ink-faint)" }}>not rated</span>
              </div>
            </div>
          ))}
          {p.holdings.length === 0 && <EmptyHoldings p={p} />}
        </div>
      </main>

      <Sheet open={attention} onClose={() => setAttention(false)} label="Needs attention" side="right">
        <AttentionContent rows={attentionRows} total={p.needsAttentionUsd} canTrade={mine} onClose={() => setAttention(false)} />
      </Sheet>
      <Sheet open={profile} onClose={() => setProfile(false)} label="Profile" side="right">
        <ProfileContent onClose={() => setProfile(false)} />
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function DemoBadge({ compact }: { compact?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: compact ? "2px 8px" : "4px 11px", fontSize: compact ? 10 : 11, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)", alignSelf: compact ? "flex-start" : "center", whiteSpace: "nowrap" }}>
      {compact ? "Demo · live prices" : "Demo · example holdings, live prices and ratings"}
    </span>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const fill = value >= 80 ? "var(--grade-a)" : value >= 65 ? "var(--grade-b)" : value >= 50 ? "var(--grade-c)" : "var(--grade-d)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={{ fontSize: 11 }}>{label}</span><span style={{ flexGrow: 1 }} /><span style={{ ...NUM, fontSize: 11, fontWeight: 700 }}>{value}</span></div>
      <div style={{ height: 5, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}><div style={{ width: `${value}%`, height: 5, borderRadius: 999, background: fill }} /></div>
    </div>
  );
}

function ValueLine({ points, width, height, fluid }: { points: number[]; width: number; height: number; fluid?: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const vbW = 150;
  const vbH = 44;
  const pts = points.map((v, i) => `${((i / (points.length - 1)) * vbW).toFixed(1)},${(vbH - 1 - ((v - min) / span) * (vbH - 2)).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={fluid ? "100%" : width} height={height} viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "var(--grade-a)" : "var(--danger)"} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function HoldingsTable({ p, canTrade }: { p: PortfolioSummary; canTrade: boolean }) {
  const router = useRouter();
  const th = { fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" as const, color: "var(--ink-faint)", fontWeight: 700 };
  return (
    <Panel style={{ flexGrow: 1, minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 20px", borderBottom: "1px solid var(--hairline)" }}>
        <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 600 }}>Holdings</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--hairline)", borderRadius: 9, padding: "7px 11px", fontSize: 11, fontWeight: 600, color: "var(--ink-soft)" }}>Sort: value</span>
      </div>
      {p.holdings.length === 0 ? (
        <div style={{ padding: 20 }}><EmptyHoldings p={p} /></div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: "left", padding: "10px 20px 8px" }}>Company</th>
              <th scope="col" style={{ ...th, textAlign: "left", padding: "10px 8px 8px" }}>90 days</th>
              <th scope="col" style={{ ...th, textAlign: "right", padding: "10px 8px 8px" }}>Value</th>
              <th scope="col" style={{ ...th, textAlign: "left", padding: "10px 8px 8px 24px" }}>If sold today</th>
              <th scope="col" style={{ ...th, textAlign: "right", padding: "10px 20px 8px" }}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {p.holdings.map((h) => {
              const s = sell(h);
              const spec = h.variant.score.instrument.speculative;
              const risk = flagged(h) && !spec && !h.valuation.stale;
              const better = h.betterVariant;
              const canMove = canTrade && better && better.score.routable && h.rawAmount && h.rawAmount !== "0" && h.decimals != null;
              return (
                <tr key={h.variant.mint} onClick={() => router.push(heldHref(h))} className="hover:bg-[var(--canvas)]" style={{ borderTop: "1px solid var(--track)", cursor: "pointer" }}>
                  <td style={{ padding: "11px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <CompanyLogo src={h.asset.logoUrl} name={h.asset.name} id={h.asset.assetId} size={32} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Link href={heldHref(h)} style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>{h.asset.name}</Link>
                          {spec && <Pill tone="warn">Speculative</Pill>}
                          {risk && <Pill tone="danger">At risk</Pill>}
                          {h.valuation.stale && <Pill tone="warn">Priced at market</Pill>}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{h.variant.symbol} · {units(h.amount)} units</span>
                        {canMove && better && (
                          <span style={{ marginTop: 3 }}>
                            <TradeTrigger label={`Move to ${better.symbol}`} variant="inline" assetName={h.asset.name} assetId={h.asset.assetId} logoUrl={h.asset.logoUrl} options={[optionOf(better)]} defaultMint={better.mint}
                              from={swapFromHolding(h)} />
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "11px 8px" }}>
                    {spec ? <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>no public market</span>
                      : h.valuation.stale ? <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>valued at the real {h.asset.symbol} price</span>
                      : <Spark values={h.spark} muted={!h.variant.score.routable} />}
                  </td>
                  <td style={{ padding: "11px 8px", textAlign: "right" }}><span style={{ ...NUM, fontSize: 14, fontWeight: 600 }}>{h.valuation.priceUsd == null ? "Unpriced" : usd(h.valueUsd)}</span></td>
                  <td style={{ padding: "11px 8px 11px 24px" }}><span style={{ ...NUM, fontSize: 13, fontWeight: 700, color: s.color }}>{s.text}</span></td>
                  <td style={{ padding: "11px 20px", textAlign: "right" }}><GradePill grade={h.variant.score.grade} score={h.variant.score.score} /></td>
                </tr>
              );
            })}
            {p.cash.filter((c) => (c.valueUsd ?? 0) > 0.5).map((c) => (
              <tr key={c.mint} style={{ borderTop: "1px solid var(--track)" }}>
                <td style={{ padding: "11px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span style={{ ...DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 999, background: "#2775CA", color: "#fff", fontSize: 13, fontWeight: 700 }}>$</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: 13, fontWeight: 600 }}>Cash</span><span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{c.symbol}</span></div>
                  </div>
                </td>
                <td />
                <td style={{ padding: "11px 8px", textAlign: "right" }}><span style={{ ...NUM, fontSize: 14, fontWeight: 600 }}>{usd(c.valueUsd)}</span></td>
                <td />
                <td style={{ padding: "11px 20px", textAlign: "right", fontSize: 11, color: "var(--ink-faint)" }}>not rated</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function HoldingCard({ h }: { h: Holding }) {
  const s = sell(h);
  const spec = h.variant.score.instrument.speculative;
  const risk = flagged(h) && !spec;
  return (
    <Link href={heldHref(h)} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: 15, padding: "13px 15px", textDecoration: "none", color: "inherit" }}>
      <CompanyLogo src={h.asset.logoUrl} name={h.asset.name} id={h.asset.assetId} size={38} />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{h.asset.name}</span>
        {spec && <span style={{ alignSelf: "flex-start" }}><Pill tone="warn">Speculative</Pill></span>}
        <span style={{ fontSize: 11, fontWeight: risk ? 700 : 500, color: risk ? "var(--danger)" : spec ? "var(--grade-c)" : "var(--ink-faint)" }}>
          {risk ? `At risk · ${h.variant.symbol} · ${s.text} to sell` : `${h.variant.symbol} · ${s.text} to sell`}
        </span>
      </div>
      <span style={{ flexGrow: 1 }} />
      {!spec && !risk && <Spark values={h.spark} width={60} height={26} />}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{h.valuation.priceUsd == null ? "Unpriced" : usd(h.valueUsd)}</span>
        <GradePill grade={h.variant.score.grade} score={h.variant.score.score} size="sm" />
      </div>
    </Link>
  );
}

function EmptyHoldings({ p }: { p: PortfolioSummary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>No tokenized stocks, ETFs or metals in this wallet{p.otherTokens > 0 ? ` — ${p.otherTokens.toLocaleString()} other tokens aren't rated here` : ""}.</span>
      <Link href="/markets" style={{ height: 42, padding: "12px 18px", borderRadius: 11, background: "var(--action)", color: "var(--action-ink)", fontSize: 13, fontWeight: 700, textDecoration: "none", boxSizing: "border-box" }}>Browse markets</Link>
    </div>
  );
}

function Breakdown({ p }: { p: PortfolioSummary }) {
  const listed = p.holdings.filter((h) => !h.variant.score.instrument.speculative).reduce((s, h) => s + h.valueUsd, 0);
  const priv = p.speculativeUsd;
  const cash = p.cashValueUsd;
  const total = listed + priv + cash || 1;
  const parts = [
    { label: "Listed", value: listed, color: "var(--grade-a)" },
    { label: "Private", value: priv, color: "var(--amber-bar)" },
    { label: "Cash", value: cash, color: "var(--neutral-bar)" },
  ].filter((x) => x.value > 0);
  const r = 47;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <Panel style={{ padding: "16px 18px" }}>
      <Label>Breakdown</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 15, marginTop: 11 }}>
        <svg width="112" height="112" viewBox="0 0 118 118" style={{ flexShrink: 0 }} role="img" aria-label="Allocation">
          <circle cx="59" cy="59" r={r} fill="none" stroke="var(--track)" strokeWidth="16" />
          {parts.map((x) => {
            const len = (x.value / total) * c;
            const el = <circle key={x.label} cx="59" cy="59" r={r} fill="none" stroke={x.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 59 59)" />;
            offset += len;
            return el;
          })}
          <text x="59" y="56" textAnchor="middle" style={DISPLAY} fontSize="20" fontWeight="700" fill="var(--ink)">{p.holdings.length}</text>
          <text x="59" y="71" textAnchor="middle" fontSize="10" fill="var(--ink-faint)">holdings</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          {parts.map((x) => (
            <div key={x.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: x.color }} /><span style={{ fontSize: 12 }}>{x.label}</span></div>
              <span style={{ ...NUM, fontSize: 14, fontWeight: 700, paddingLeft: 15 }}>{((x.value / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}


function Activity({ signals, holdings }: { signals: Signal[]; holdings: Holding[] }) {
  const logoOf = (mint?: string) => holdings.find((h) => h.variant.mint === mint)?.asset;
  const top = signals.filter(isChange).slice(0, 4);
  return (
    <Panel style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Label>Portfolio activity</Label>
        <span style={{ flexGrow: 1 }} />
        <ArrowLink href="/updates?f=holdings">See all</ArrowLink>
      </div>
      {top.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 12 }}>Nothing has changed for your holdings.</span>
      ) : top.map((s, i) => {
        const a = logoOf(s.mint);
        return (
          <div key={i} style={{ display: "flex", gap: 11, marginTop: 14 }}>
            {a ? <CompanyLogo src={a.logoUrl} name={a.name} id={a.assetId} size={30} /> : <span style={{ width: 30, height: 30, borderRadius: 999, background: "var(--track)", flexShrink: 0 }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 12, lineHeight: 1.4 }}>{signalTitle(s)}</span>
              <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{signalMeta(s)}</span>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function AttentionContent({ rows, total, canTrade, onClose }: { rows: Holding[]; total: number; canTrade: boolean; onClose: () => void }) {
  return (
    <div style={{ padding: "22px 20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: "var(--danger-deep)", fontWeight: 700 }}>Needs attention</span>
          <span style={{ ...NUM, fontSize: 28, fontWeight: 700 }}>{usd(total)}</span>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} holding{rows.length === 1 ? "" : "s"}, each with what you can do</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 12, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}>{Icon.close()}</button>
      </div>
      {rows.map((h) => {
        const s = sell(h);
        const better = h.betterVariant;
        const canMove = canTrade && better && better.score.routable && h.rawAmount && h.rawAmount !== "0" && h.decimals != null;
        return (
          <div key={h.variant.mint} style={{ border: "1px solid var(--danger-line)", background: "var(--danger-soft)", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <CompanyLogo src={h.asset.logoUrl} name={h.asset.name} id={h.asset.assetId} size={34} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{h.asset.name} · {h.variant.symbol}</span>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{usd(h.valueUsd)} · selling today gives up <b style={{ color: s.color }}>{s.text}</b></span>
              </div>
              <span style={{ marginLeft: "auto" }}><GradePill grade={h.variant.score.grade} score={h.variant.score.score} onWhite /></span>
            </div>
            {h.why && <span style={{ fontSize: 12, lineHeight: 1.45 }}>{h.why.headline}</span>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canMove && better && (
                <TradeTrigger label={`Move to ${better.symbol} · ${better.score.grade} ${better.score.score ?? ""}`} variant="inline" assetName={h.asset.name} assetId={h.asset.assetId} logoUrl={h.asset.logoUrl} options={[optionOf(better)]} defaultMint={better.mint}
                  from={swapFromHolding(h)} />
              )}
              <Link href={heldHref(h)} onClick={onClose} style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid var(--hairline)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>
                Open {h.asset.name}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div style={{ padding: "18px 26px", display: "flex", flexDirection: "column", gap: 14 }} aria-busy="true">
      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Reading the wallet and quoting what each holding would sell for right now…</span>
      <div className="grid gap-[14px] lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((i) => <div key={i} className="animate-pulse" style={{ height: 128, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--hairline)" }} />)}
      </div>
      <div className="animate-pulse" style={{ height: 360, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--hairline)" }} />
    </div>
  );
}
