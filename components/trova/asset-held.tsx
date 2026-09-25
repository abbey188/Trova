"use client";

// The asset page in the context of what you hold. When the token you hold isn't the soundest one of
// its company, HeldCard leads — your token, what it costs you, and the move — and the highest-rated
// token follows as the alternative. CompareButton puts every token of the company side by side.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CompanyLogo, DISPLAY, GradePill, Icon, NUM, PillarBar, ScoreRing } from "@/components/trova/kit";
import { toOption, type SwapFrom } from "@/components/trova/trade-sheet";
import { TradeTrigger } from "@/components/trova/trade-trigger";
import { useWalletAddress } from "@/components/trova/wallet";
import { api } from "@/lib/client";
import { count, usd } from "@/lib/format";
import type { AssetDetail, AssetVariantView } from "@/lib/types";

type Ladder = { ladder: { usdSize: number; status: string; roundTripPct: number | null }[] };

const tierLabel = (t: string) => `Tier ${t.replace(/\D/g, "") || "3"}`;
const whyHref = (assetId: string, mint: string) => `/asset/${encodeURIComponent(assetId)}/rating/${mint}`;
const REDEMPTION: Record<string, string> = { share_redeemable: "For the share", cash_redeemable: "For cash value", not_redeemable: "None" };

export function HeldCard({ detail, held, top, swapFrom }: {
  detail: AssetDetail;
  held: { variant: AssetVariantView; valueUsd: number | null; sellLossPct: number | null };
  top: AssetVariantView;
  swapFrom?: SwapFrom;
}) {
  const address = useWalletAddress();
  const v = held.variant;
  const s = v.score;
  const stuck = !s.routable;
  const loss = held.sellLossPct;
  const canMove = !!swapFrom && swapFrom.mint === v.mint && top.score.routable;
  return (
    <section style={{ background: stuck ? "var(--danger-soft)" : "var(--warn-soft)", border: `1px solid ${stuck ? "var(--danger-line)" : "var(--grade-c-bg)"}`, borderRadius: 16, padding: "17px 19px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ display: "inline-flex", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: stuck ? "var(--danger)" : "var(--grade-c)", background: "var(--surface)" }}>You hold</span>
        <span style={{ flexGrow: 1 }} />
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{v.issuer} · {tierLabel(v.tier)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 13 }}>
        <ScoreRing score={s.score} grade={s.grade} size={70} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ ...DISPLAY, fontSize: 19, fontWeight: 600 }}>{v.symbol}</span>
          {held.valueUsd != null && <span style={{ ...NUM, fontSize: 13, fontWeight: 700 }}>{usd(held.valueUsd)} held</span>}
          {loss != null ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: loss >= 10 ? "var(--danger)" : loss >= 1 ? "var(--grade-c)" : "var(--grade-a)" }}>{loss < 0.01 ? "<0.01" : loss.toFixed(loss >= 10 ? 1 : 2)}% lost if sold today</span>
          ) : stuck ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)" }}>{s.notRoutableReason ?? "Not tradable now"}</span> : null}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 13 }}>
        <PillarBar label="Ownership" value={s.ownership.score} height={5} compact />
        <PillarBar label="Exit" value={s.exit.score} height={5} compact />
      </div>
      {v.explanation && <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: 1.5, fontWeight: 600 }}>{v.explanation.headline}</p>}

      <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${stuck ? "var(--danger-line)" : "var(--grade-c-bg)"}`, display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CompanyLogo src={detail.asset.logoUrl} name={detail.asset.name} id={detail.asset.assetId} size={30} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Same company, sounder: {top.symbol}</span>
            <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{usd(top.liquidityUsd, { compact: true })} liquidity · {top.issuer}</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <GradePill grade={top.score.grade} score={top.score.score} onWhite />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {canMove ? (
            <TradeTrigger label={`Move to ${top.symbol}`} assetName={detail.asset.name} assetId={detail.asset.assetId} logoUrl={detail.asset.logoUrl} options={[toOption(top)]} defaultMint={top.mint} from={swapFrom} />
          ) : (
            <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{address ? `Move from ${v.symbol} to ${top.symbol} with one signature.` : "Connect your wallet to move it — one signature."}</span>
          )}
          <span style={{ flexGrow: 1 }} />
          <Link href={whyHref(detail.asset.assetId, v.mint)} style={{ fontSize: 11, fontWeight: 700, textDecoration: "none", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>Why {s.score ?? "NR"}? →</Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

export function CompareButton({ detail, all, heldMint }: { detail: AssetDetail; all: AssetVariantView[]; heldMint?: string }) {
  const [open, setOpen] = useState(false);
  const worst = [...all].sort((a, b) => (a.score.score ?? -1) - (b.score.score ?? -1))[0];
  const risky = all.filter((o) => !o.score.routable).length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="hover:bg-[var(--canvas)]"
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 16, padding: "14px 16px", cursor: "pointer", textAlign: "left", minHeight: 58, color: "var(--ink)", fontFamily: "inherit" }}>
        <div style={{ display: "flex" }}>
          {all.slice(0, 3).map((v, i) => (
            <span key={v.mint} style={{ ...NUM, marginLeft: i ? -8 : 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, boxShadow: "0 0 0 2px var(--surface)", fontSize: 10, fontWeight: 700, color: gradeFg(v), background: gradeBg(v) }}>{v.score.grade}</span>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Compare all {all.length} tokens side by side</span>
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{worst ? `lowest rated ${worst.score.grade} ${worst.score.score ?? ""}` : ""}{risky ? ` · ${risky} not tradable` : ""}</span>
        </div>
        <span style={{ flexGrow: 1 }} />
        {Icon.chevronRight(16, "var(--ink-faint)")}
      </button>
      {open && <CompareModal detail={detail} all={all} heldMint={heldMint} onClose={() => setOpen(false)} />}
    </>
  );
}

const gradeFg = (v: AssetVariantView) => `var(--grade-${v.score.grade === "NR" ? "nr" : v.score.grade.toLowerCase()})`;
const gradeBg = (v: AssetVariantView) => `var(--grade-${v.score.grade === "NR" ? "nr" : v.score.grade.toLowerCase()}-bg)`;

function LeaveCell({ mint }: { mint: string }) {
  const q = useQuery({ queryKey: ["exit", mint], queryFn: () => api<Ladder>(`/api/exit?mint=${mint}`), staleTime: 120_000 });
  const r = q.data?.ladder[0];
  if (q.isPending) return <span className="animate-pulse" style={{ display: "inline-block", width: 48, height: 12, borderRadius: 6, background: "var(--track)" }} />;
  if (!r || r.status === "unavailable") return <span style={{ color: "var(--ink-faint)" }}>—</span>;
  if (r.status !== "ok") return <span style={{ color: "var(--danger)", fontWeight: 700 }}>No route</span>;
  const v = r.roundTripPct ?? 0;
  return <span style={{ ...NUM, fontWeight: 700, color: v >= 10 ? "var(--danger)" : v >= 1 ? "var(--grade-c)" : "var(--grade-a)" }}>{v < 0.01 ? "<0.01" : v.toFixed(2)}%</span>;
}

function CompareModal({ detail, all, heldMint, onClose }: { detail: AssetDetail; all: AssetVariantView[]; heldMint?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const bestMint = detail.best?.mint;
  const rows: [string, (v: AssetVariantView) => React.ReactNode][] = [
    ["Rating", (v) => <GradePill grade={v.score.grade} score={v.score.score} size="lg" />],
    ["Ownership", (v) => <span style={{ ...NUM, fontWeight: 700 }}>{v.score.ownership.score}</span>],
    ["Exit", (v) => <span style={{ ...NUM, fontWeight: 700, color: v.score.exit.score < 50 ? "var(--grade-d)" : undefined }}>{v.score.exit.score}</span>],
    ["Redeemable", (v) => (v.stockVariantTier ? REDEMPTION[v.stockVariantTier] : "Not reported")],
    ["Tradable now", (v) => (v.score.routable ? <span style={{ color: "var(--grade-a)", fontWeight: 700 }}>Yes</span> : <span style={{ color: "var(--danger)", fontWeight: 700 }}>No</span>)],
    ["Cost to leave · $5,000", (v) => <LeaveCell mint={v.mint} />],
    ["Liquidity", (v) => <span style={NUM}>{usd(v.liquidityUsd, { compact: true })}</span>],
    ["Holders", (v) => <span style={NUM}>{count(v.holders)}</span>],
    ["Issuer", (v) => v.issuer],
  ];
  // Narrow enough that two tokens sit side by side on a 390px phone.
  const cols = `minmax(88px, 150px) repeat(${all.length}, minmax(118px, 1fr))`;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Compare ${detail.asset.name} tokens`} style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", inset: 0, border: "none", cursor: "default", background: "rgba(20,22,26,0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
      <div style={{ position: "relative", width: `min(${220 + all.length * 230}px, 100%)`, maxHeight: "90vh", overflow: "auto", background: "var(--surface)", borderRadius: 22, padding: "20px clamp(14px, 3vw, 22px) 18px", boxShadow: "0 24px 64px rgba(20,22,26,0.28)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <CompanyLogo src={detail.asset.logoUrl} name={detail.asset.name} id={detail.asset.assetId} size={34} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ ...DISPLAY, fontSize: 18, fontWeight: 700 }}>{detail.asset.name} · {all.length} tokens</span>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Same company, different paperwork and different markets.</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}>{Icon.close()}</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, minWidth: 88 + all.length * 118 }}>
            <span />
            {all.map((v) => {
              const held = v.mint === heldMint;
              const best = v.mint === bestMint;
              return (
                <div key={v.mint} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px 12px", borderRadius: "14px 14px 0 0", background: best ? "var(--good-soft)" : held ? (v.score.routable ? "var(--warn-soft)" : "var(--danger-soft)") : "transparent" }}>
                  <span style={{ ...DISPLAY, fontSize: 16, fontWeight: 700 }}>{v.symbol}</span>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", minHeight: 20 }}>
                    {best && <Tag fg="var(--grade-a)">Highest rated</Tag>}
                    {held && <Tag fg={v.score.routable ? "var(--grade-c)" : "var(--danger)"}>You hold</Tag>}
                    {v.score.instrument.speculative && <Tag fg="var(--grade-c)">Speculative</Tag>}
                  </div>
                </div>
              );
            })}
            {rows.map(([label, cell]) => (
              <div key={label} style={{ display: "contents" }}>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600, padding: "11px 0", borderTop: "1px solid var(--track)", display: "flex", alignItems: "center" }}>{label}</span>
                {all.map((v) => (
                  <span key={v.mint} style={{ fontSize: 13, padding: "11px 12px", borderTop: "1px solid var(--track)", display: "flex", alignItems: "center", background: v.mint === bestMint ? "var(--good-soft)" : undefined }}>{cell(v)}</span>
                ))}
              </div>
            ))}
            <span />
            {all.map((v) => (
              <div key={v.mint} style={{ padding: "12px", borderTop: "1px solid var(--track)", background: v.mint === bestMint ? "var(--good-soft)" : undefined, borderRadius: "0 0 14px 14px" }}>
                <Link href={whyHref(detail.asset.assetId, v.mint)} onClick={onClose} style={{ fontSize: 12, fontWeight: 700, textDecoration: "none", color: "var(--grade-a)" }}>Why {v.score.score ?? "NR"}? →</Link>
              </div>
            ))}
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--ink-faint)" }}>Cost to leave is measured: we quote buying $5,000 and selling it straight back through Jupiter. Ratings update as information becomes public.</p>
      </div>
    </div>,
    document.body,
  );
}

function Tag({ children, fg }: { children: React.ReactNode; fg: string }) {
  return <span style={{ display: "inline-flex", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: fg, background: "var(--surface)" }}>{children}</span>;
}
