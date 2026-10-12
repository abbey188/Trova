"use client";

// The measured side of a token, at the reader's own size: what it costs to leave, how much can leave
// before it costs more, what the issuer can do to the token on-chain, and what those numbers mean for
// someone lending against it. Every figure here is a quote or a read of the mint — nothing modelled.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Label, NUM, Panel } from "@/components/trova/kit";
import { api } from "@/lib/client";
import { usd } from "@/lib/format";
import type { AssetDetail, AssetVariantView } from "@/lib/types";

type Rung = { usdSize: number; status: string; roundTripPct: number | null; liquidity?: string | null; poolsRoundTripPct?: number | null };
type Bracket = { underUsd: number | null; overUsd: number | null };
export type ExitResponse = {
  ladder: Rung[];
  ceilings?: { under1: Bracket; under5: Bracket };
  source?: "stored" | "live";
  quotedAt?: number;
  session?: "open" | "closed" | null;
  closedSession?: { takenAt: string; ladder: Rung[] } | null;
};

/** The rung the "tradable" rule reads, or the first one when that size was not quoted. */
export const ruleRung = (ladder?: Rung[]) => ladder?.find((r) => r.usdSize === 5_000) ?? ladder?.[0];

export function useExit(mint: string) {
  return useQuery({ queryKey: ["exit", mint], queryFn: () => api<ExitResponse>(`/api/exit?mint=${mint}`), staleTime: 120_000 });
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const costColor = (r: Rung) => (r.status !== "ok" || (r.roundTripPct ?? 0) >= 10 ? "var(--danger)" : (r.roundTripPct ?? 0) >= 1 ? "var(--grade-b)" : "var(--grade-a)");

function costText(r: Rung): string {
  if (r.status === "ok") return `${(r.roundTripPct ?? 0).toFixed(2)}%`;
  if (r.status === "no-route") return "No route";
  if (r.status === "market-closed") return "Shut";
  return "—";
}

function ceilingText(b: Bracket | undefined, pct: number): string | null {
  if (!b) return null;
  if (b.underUsd != null && b.overUsd != null) return `Under ${pct}% up to ${money(b.underUsd)}; over ${pct}% by ${money(b.overUsd)}.`;
  if (b.underUsd != null) return `Under ${pct}% at every size measured, up to ${money(b.underUsd)}.`;
  if (b.overUsd != null) return `No size measured under ${pct}%.`;
  return null;
}

function Row({ r, worst }: { r: Rung; worst: number }) {
  const v = r.roundTripPct ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ ...NUM, fontSize: 12, color: "var(--ink-soft)", width: 74 }}>{money(r.usdSize)}</span>
      <div style={{ flexGrow: 1, height: 6, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ width: r.status === "ok" ? `${Math.max(2, (v / worst) * 100)}%` : r.status === "market-closed" ? "0%" : "100%", height: 6, background: costColor(r) }} />
      </div>
      <span style={{ ...NUM, fontSize: 12, fontWeight: 700, width: 62, textAlign: "right", color: r.status === "ok" ? "var(--ink)" : r.status === "market-closed" ? "var(--ink-soft)" : "var(--danger)" }}>{costText(r)}</span>
    </div>
  );
}

/** Who filled the exit, and what the pools alone would have cost when that is a different story. */
function filledBy(ladder: Rung[]): string | null {
  const ok = ladder.filter((r) => r.status === "ok");
  if (ok.length === 0) return null;
  const maker = ok.filter((r) => r.liquidity === "market-maker");
  const gap = ok.find((r) => r.poolsRoundTripPct != null && r.roundTripPct != null && r.poolsRoundTripPct - r.roundTripPct >= 5);
  const who = maker.length === ok.length ? "Filled by a market maker's quote, not by pools."
    : maker.length > 0 ? "Smaller sizes fill from pools; larger ones from a market maker's quote."
    : "Filled from on-chain pools.";
  return gap ? `${who} Through pools alone ${money(gap.usdSize)} would cost ${gap.poolsRoundTripPct!.toFixed(1)}%.` : who;
}

export function ExitCard({ mint, heldUsd }: { mint: string; heldUsd?: number | null }) {
  const q = useExit(mint);
  const [draft, setDraft] = useState(heldUsd && heldUsd >= 1 ? String(Math.round(heldUsd)) : "");
  const [size, setSize] = useState<number | null>(null);
  const mine = useQuery({
    queryKey: ["exit-size", mint, size],
    queryFn: () => api<ExitResponse>(`/api/exit?mint=${mint}&sizes=${size}`),
    enabled: size != null,
    staleTime: 120_000,
  });

  const ladder = q.data?.ladder ?? [];
  const worst = Math.max(5, ...ladder.map((r) => r.roundTripPct ?? 0));
  const when = q.data?.quotedAt ? new Date(q.data.quotedAt) : null;
  const source = q.data?.source === "stored" && when
    ? `Measured ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC${q.data.session === "closed" ? ", US market shut" : ""}.`
    : "Quoted just now.";
  const shut = ruleRung(q.data?.closedSession?.ladder);
  const result = mine.data?.ladder[0];
  const parsed = Number(draft.replace(/[$,\s]/g, ""));
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 10_000_000;

  return (
    <Panel style={{ padding: "16px 18px" }}>
      <Label>What it costs to leave</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
        {q.isPending ? [0, 1, 2].map((i) => <div key={i} className="animate-pulse" style={{ height: 14, borderRadius: 6, background: "var(--track)" }} />)
          : ladder.map((r) => <Row key={r.usdSize} r={r} worst={worst} />)}
      </div>

      {!q.isPending && !q.isError && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--track)" }}>
          {[ceilingText(q.data?.ceilings?.under1, 1), ceilingText(q.data?.ceilings?.under5, 5)].filter(Boolean).map((t) => (
            <span key={t} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{t}</span>
          ))}
          {filledBy(ladder) && <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-soft)" }}>{filledBy(ladder)}</span>}
          {shut && q.data?.session !== "closed" && (
            <span style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-soft)" }}>
              While the US market is shut: {shut.status === "ok" ? `${money(shut.usdSize)} costs ${(shut.roundTripPct ?? 0).toFixed(2)}%.` : shut.status === "market-closed" ? "it does not trade." : `no route for ${money(shut.usdSize)}.`}
            </span>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (valid) setSize(Math.round(parsed)); }}
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <label htmlFor={`size-${mint}`} style={{ fontSize: 12, color: "var(--ink-soft)", flexShrink: 0 }}>Your size</label>
        <div style={{ display: "flex", alignItems: "center", flexGrow: 1, minWidth: 0, height: 36, border: "1px solid var(--hairline)", borderRadius: 10, padding: "0 10px", background: "var(--surface)" }}>
          <span style={{ ...NUM, fontSize: 13, color: "var(--ink-faint)" }}>$</span>
          <input id={`size-${mint}`} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="500"
            style={{ ...NUM, flexGrow: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: 13, padding: "0 6px" }} />
        </div>
        <button type="submit" disabled={!valid || mine.isFetching}
          style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 700, cursor: valid ? "pointer" : "default", opacity: valid ? 1 : 0.5, fontFamily: "inherit" }}>
          {mine.isFetching ? "Quoting…" : "Quote"}
        </button>
      </form>
      {size != null && !mine.isFetching && (
        <p style={{ margin: "9px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--ink)" }}>
          {mine.isError || !result || result.status === "unavailable" ? "Couldn't reach Jupiter just now — this says nothing about whether you can sell."
            : result.status === "market-closed" ? `${money(size)}: this token does not trade while the US market is shut.`
            : result.status !== "ok" ? `${money(size)}: no route at this size.`
            : <>
                <b style={{ ...NUM }}>{money(size)}</b> in and straight back out costs <b style={{ ...NUM, color: costColor(result) }}>{(result.roundTripPct ?? 0).toFixed(2)}%</b>
                {" "}({usd(size * (result.roundTripPct ?? 0) / 100)}), {result.liquidity === "market-maker" ? "filled by a market maker's quote" : "filled from pools"}
                {result.poolsRoundTripPct != null && result.poolsRoundTripPct - (result.roundTripPct ?? 0) >= 1 ? `; pools alone ${result.poolsRoundTripPct.toFixed(1)}%.` : "."}
              </>}
        </p>
      )}

      <p style={{ margin: "11px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)" }}>
        {q.isError ? "Couldn't reach Jupiter just now — this says nothing about whether you can sell."
          : `A round trip: buy with USDC, sell straight back, on the better of Jupiter's two routes. ${q.isPending ? "" : source}`}
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------- issuer controls

function Control({ label, value, tone }: { label: string; value: string; tone: "yes" | "no" | "note" }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--ink-soft)", flexGrow: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: tone === "yes" ? "var(--ink)" : "var(--ink-faint)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function ControlsCard({ top }: { top: AssetVariantView }) {
  const c = top.controls;
  return (
    <Panel style={{ padding: "16px 18px" }}>
      <Label>What the issuer can do to {top.symbol}</Label>
      {!c ? (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>The token&apos;s mint account could not be read just now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
          <Control label="Move tokens out of any wallet" value={c.canSeize ? "Yes" : "No"} tone={c.canSeize ? "yes" : "no"} />
          <Control label="Pause every transfer" value={c.canPause ? (c.paused ? "Yes — paused now" : "Yes — not paused") : "No"} tone={c.canPause ? "yes" : "no"} />
          <Control label="Freeze a single account" value={c.canFreeze ? "Yes" : "No"} tone={c.canFreeze ? "yes" : "no"} />
          <Control label="Create more tokens" value={c.canMint ? "Yes" : "No"} tone={c.canMint ? "yes" : "no"} />
          {c.newAccountsFrozen != null && <Control label="New accounts start frozen" value={c.newAccountsFrozen ? "Yes" : "No — setting exists"} tone={c.newAccountsFrozen ? "yes" : "no"} />}
          <Control label="Run a program on every transfer" value={c.hookProgram ? "Yes" : c.hookSlot ? "Not now — slot exists" : "No"} tone={c.hookProgram ? "yes" : "no"} />
          <Control label="Fee on every transfer" value={c.transferFeeBps == null ? "None" : c.transferFeeBps > 0 ? `${(c.transferFeeBps / 100).toFixed(2)}%` : "0% — can be set"} tone={(c.transferFeeBps ?? 0) > 0 ? "yes" : "no"} />
        </div>
      )}
      <p style={{ margin: "11px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)" }}>
        Read from the token&apos;s mint account on Solana just now. Controls like these are usual for a regulated issuer; they are shown so you can see them, and none of them moves the rating.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------- lender view

const BONUSES = [3, 5, 7.5, 10];
const MARGIN = 1; // a liquidator keeps at least this much of the bonus after selling

export function LenderCard({ mint, gap }: { mint: string; gap?: AssetDetail["weekendGap"] }) {
  const q = useExit(mint);
  const [bonus, setBonus] = useState(5);
  const ladder = (q.data?.ladder ?? []).filter((r) => r.status === "ok" || r.status === "no-route").sort((a, b) => a.usdSize - b.usdSize);

  // The largest measured size a liquidator can sell and still keep `MARGIN` of the bonus.
  let cap: Rung | null = null;
  let over: Rung | null = null;
  for (const r of ladder) {
    const inside = r.status === "ok" && r.roundTripPct != null && r.roundTripPct < bonus - MARGIN;
    if (inside && !over) cap = r;
    else if (!inside && !over) over = r;
  }
  const threshold = cap && gap ? 100 - bonus - (cap.roundTripPct ?? 0) - gap.maxPct : null;

  return (
    <Panel style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Label>If you lend against it</Label>
        <span style={{ flexGrow: 1 }} />
        <label htmlFor={`bonus-${mint}`} style={{ fontSize: 11, color: "var(--ink-faint)" }}>Liquidation bonus</label>
        <select id={`bonus-${mint}`} value={bonus} onChange={(e) => setBonus(Number(e.target.value))}
          style={{ ...NUM, height: 28, borderRadius: 8, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 700, padding: "0 6px", fontFamily: "inherit" }}>
          {BONUSES.map((b) => <option key={b} value={b}>{b}%</option>)}
        </select>
      </div>

      {q.isPending ? <div className="animate-pulse" style={{ height: 44, borderRadius: 8, background: "var(--track)", marginTop: 12 }} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--ink-soft)", flexGrow: 1 }}>Largest size a liquidator can sell inside the bonus</span>
            <span style={{ ...NUM, fontSize: 14, fontWeight: 700, color: cap ? "var(--ink)" : "var(--danger)" }}>{cap ? money(cap.usdSize) : "None measured"}</span>
          </div>
          {over && <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>At {money(over.usdSize)} selling {over.status === "ok" ? `costs ${(over.roundTripPct ?? 0).toFixed(2)}%` : "finds no route"}, more than the bonus leaves.</span>}
          {gap && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft)", flexGrow: 1 }}>Largest move in the real share across a closure, last year</span>
              <span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{gap.maxPct.toFixed(1)}%</span>
            </div>
          )}
          {threshold != null && cap && gap && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingTop: 9, borderTop: "1px solid var(--track)" }}>
              <span style={{ fontSize: 12, color: "var(--ink-soft)", flexGrow: 1 }}>Liquidation threshold that would have survived that move</span>
              <span style={{ ...NUM, fontSize: 14, fontWeight: 700 }}>{threshold > 0 ? `${threshold.toFixed(0)}%` : "None"}</span>
            </div>
          )}
        </div>
      )}

      <p style={{ margin: "11px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--ink-faint)" }}>
        A liquidation only happens if selling the collateral costs less than the bonus paid for doing it.
        {threshold != null && cap && gap ? ` Threshold = 100% − ${bonus}% bonus − ${(cap.roundTripPct ?? 0).toFixed(2)}% exit cost − ${gap.maxPct.toFixed(1)}% gap, over ${gap.closures} closures.` : ""}
        {" "}Measured facts, not a recommendation: a lender adds its own margin.
      </p>
    </Panel>
  );
}
