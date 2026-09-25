"use client";

// The trade sheet, as the BuyMobile / BuyBlockedMobile / SwapMobile boards draw it. Three states:
//   buy      — pick the token, pay in USDC (25% · 50% · Max of your balance), see what you get and
//              what leaving again would cost, measured by quoting the sale straight back
//   blocked  — the chosen token can't be left (not tradable, or ≥10% lost on the way back out):
//              the loss in red, both halves of the rating, and the sound token of the same company
//   swap     — move a holding into the sound token: what you hold → what you receive
// Our server builds the unsigned transaction; the wallet signs AND sends it. It is the only step in
// Trova that asks for a signature, and Trova never holds a key.

import { getBase58Decoder, getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { solanaClient } from "@/app/providers";
import { useHomeHref } from "@/components/trova/frame";
import { CompanyLogo, DISPLAY, GradePill, Icon, NUM } from "@/components/trova/kit";
import { ConnectButton, useWalletAddress } from "@/components/trova/wallet";
import { api } from "@/lib/client";
import { usd } from "@/lib/format";
import type { Holding, PortfolioSummary, Rating, Variant } from "@/lib/types";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Losing this much on the way back out blocks a buy until the buyer chooses to continue. */
const BLOCK_AT_PCT = 10;

export interface TokenOption {
  mint: string;
  symbol: string;
  issuer: string;
  grade: Rating;
  score: number | null;
  routable: boolean;
  notRoutableReason?: string;
  liquidityUsd: number;
  priceUsd: number;
  speculative: boolean;
  instrumentSummary: string;
  ownership?: number;
  exit?: number;
}

/** "From" for a swap out of a token the wallet already holds; absent for a buy with USDC. */
export interface SwapFrom {
  mint: string; symbol: string; rawAmount: string; decimals: number; valueUsd: number;
  grade?: Rating; score?: number | null; exit?: number; liquidityUsd?: number;
}

export const toOption = (v: Variant): TokenOption => ({
  mint: v.mint, symbol: v.symbol, issuer: v.issuer, grade: v.score.grade, score: v.score.score,
  routable: v.score.routable, notRoutableReason: v.score.notRoutableReason, liquidityUsd: v.liquidityUsd,
  priceUsd: v.priceUsd, speculative: v.score.instrument.speculative, instrumentSummary: v.score.instrument.summary,
  ownership: v.score.ownership.score, exit: v.score.exit.score,
});

export const swapFromHolding = (h: Holding): SwapFrom => ({
  mint: h.variant.mint, symbol: h.variant.symbol, rawAmount: h.rawAmount!, decimals: h.decimals!, valueUsd: h.valueUsd,
  grade: h.variant.score.grade, score: h.variant.score.score, exit: h.variant.score.exit.score, liquidityUsd: h.variant.liquidityUsd,
});

interface Quote {
  status: "ok" | "no-route" | "unavailable";
  inAmount?: string;
  outAmount?: string;
  inUi?: number | null;
  outUi?: number | null;
  priceImpactPct?: number;
  routeLabels?: string[];
  leaveAgain?: { status: string; backUi: number | null; roundTripPct: number | null };
}

type Phase =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "signing" }
  | { kind: "sent"; signature: string }
  | { kind: "done"; signature: string }
  | { kind: "failed"; message: string; signature?: string };

const lossTone = (pct: number | null) => (pct == null ? "var(--ink)" : pct >= BLOCK_AT_PCT ? "var(--danger)" : pct >= 1 ? "var(--grade-c)" : "var(--grade-a)");
const fmtPct = (n: number) => `${n < 0.01 ? "<0.01" : n.toFixed(n >= 10 ? 1 : 2)}%`;
const fmtUnits = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : 6 });
const LABEL = { fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 } as const;

export function TradeSheet({
  open, onClose, assetName, assetId, logoUrl, options, defaultMint, from,
}: {
  open: boolean;
  onClose: () => void;
  assetName: string;
  assetId?: string;
  logoUrl?: string | null;
  options: TokenOption[];
  defaultMint: string;
  from?: SwapFrom;
}) {
  const [mint, setMint] = useState(defaultMint);
  const [amount, setAmount] = useState("500");
  const [debounced, setDebounced] = useState(amount);
  const [override, setOverride] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const connected = useConnectedWallet(solanaClient);
  const address = useWalletAddress();

  useEffect(() => { setMint(defaultMint); setOverride(false); setPhase({ kind: "idle" }); }, [defaultMint, open]);
  useEffect(() => { const t = setTimeout(() => setDebounced(amount), 350); return () => clearTimeout(t); }, [amount]);
  const busy = phase.kind === "building" || phase.kind === "signing" || phase.kind === "sent";
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose, busy]);

  // The connected wallet's USDC, for "Balance" and the 25% · 50% · Max chips. Reading it needs only
  // the public address — the same portfolio query Home already made.
  const portfolio = useQuery({ queryKey: ["portfolio", address], queryFn: () => api<PortfolioSummary>(`/api/portfolio?wallet=${address}`), enabled: open && !!address && !from, staleTime: 60_000 });
  const usdcBalance = portfolio.data?.cash.find((c) => c.mint === USDC)?.amount ?? null;

  const target = options.find((o) => o.mint === mint) ?? options[0];
  const best = options.filter((o) => o.routable).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
  const inputMint = from ? from.mint : USDC;
  const rawIn = from ? from.rawAmount : toRaw(debounced, 6);

  const quote = useQuery({
    queryKey: ["quote", inputMint, target?.mint, rawIn],
    queryFn: () => api<Quote>(`/api/quote?inputMint=${inputMint}&outputMint=${target.mint}&amount=${rawIn}&slippageBps=${from ? 100 : 50}`),
    enabled: open && !!target && !!rawIn && rawIn !== "0" && inputMint !== target.mint,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  if (!open || !target) return null;

  const q = quote.data;
  const pay = Number(debounced) || 0;
  const outValue = q?.outUi != null ? q.outUi * target.priceUsd : null;
  const leaveLoss = q?.leaveAgain?.roundTripPct ?? null;
  const swapLoss = from && outValue != null && from.valueUsd > 0 ? Math.max(0, (1 - outValue / from.valueUsd) * 100) : null;
  const blocked = !from && !override && (!target.routable || (leaveLoss != null && leaveLoss >= BLOCK_AT_PCT));
  const alt = best && best.mint !== target.mint ? best : null;
  const quoting = quote.isPending && quote.fetchStatus !== "idle";
  const logo = (size: number) => <CompanyLogo src={logoUrl} name={assetName} id={assetId} size={size} />;

  const title = from ? `Move out of ${from.symbol}` : blocked ? `Buy ${target.symbol}` : `Buy ${assetName}`;
  const subtitle = from ? "Same company, a token you can leave"
    : blocked ? `${target.issuer} · one of ${options.length} ${assetName} token${options.length === 1 ? "" : "s"}`
    : `${options.length} token${options.length === 1 ? "" : "s"} track${options.length === 1 ? "s" : ""} this company`;

  // ------------------------------------------------------------------------------------------- the action
  const action = (label: string, note: string): ReactNode =>
    !connected ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <ConnectButton size="lg" />
        <span style={{ textAlign: "center", fontSize: 11, color: "var(--ink-faint)" }}>Connect to trade. Looking never needs a signature.</span>
      </div>
    ) : connected.signer == null ? (
      <span style={{ fontSize: 12, color: "var(--danger)" }}>This wallet is read-only here, so it can&apos;t sign a trade.</span>
    ) : (
      <SendButton account={connected.account} disabled={q?.status !== "ok" || busy} phase={phase} setPhase={setPhase} label={label} note={note}
        request={{ inputMint, outputMint: target.mint, amount: rawIn ?? "0", slippageBps: from ? 100 : 50 }} />
    );

  let body: ReactNode;
  let footer: ReactNode;

  if (phase.kind === "done" || phase.kind === "sent") {
    body = <Result phase={phase} symbol={target.symbol} onClose={onClose} />;
    footer = null;
  } else if (from) {
    // ----------------------------------------------------------------------------------------- swap
    const fromBad = (from.exit ?? 100) < 50;
    body = (
      <>
        <div style={{ background: fromBad ? "var(--danger-soft)" : "var(--canvas)", border: `1px solid ${fromBad ? "var(--danger-line)" : "var(--hairline)"}`, borderRadius: 17, padding: "15px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: fromBad ? "var(--danger-deep)" : "var(--ink-faint)", fontWeight: 700 }}>You hold</span>
            <span style={{ flexGrow: 1 }} />
            {from.grade && <GradePill grade={from.grade} score={from.score ?? null} size="sm" onWhite />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
            {logo(40)}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...NUM, fontSize: 22, fontWeight: 700 }}>{fmtUnits(Number(from.rawAmount) / 10 ** from.decimals)}</span>
              <span style={{ fontSize: 11, color: fromBad ? "var(--danger-deep)" : "var(--ink-soft)" }}>{from.symbol} · {usd(from.valueUsd)}</span>
            </div>
            <span style={{ flexGrow: 1 }} />
            <span style={{ borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: fromBad ? "var(--danger)" : "var(--ink-soft)", background: "var(--surface)" }}>All</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", margin: "-13px 0", position: "relative", zIndex: 2 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, background: "var(--ink)", color: "var(--surface)", border: "4px solid var(--surface)" }}>{Icon.down(14)}</span>
        </div>
        <div style={{ background: "var(--good-soft)", border: "2px solid var(--grade-a)", borderRadius: 17, padding: "15px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "var(--grade-a)", fontWeight: 700 }}>You receive</span>
            <span style={{ flexGrow: 1 }} />
            <GradePill grade={target.grade} score={target.score} size="sm" onWhite />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
            {logo(40)}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...NUM, fontSize: 22, fontWeight: 700 }}>{quoting ? "…" : q?.outUi != null ? fmtUnits(q.outUi) : "—"}</span>
              <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{target.symbol}{outValue != null ? ` · ${usd(outValue)}` : ""}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <BeforeAfter label="Exit" before={from.exit != null ? String(from.exit) : "—"} after={target.exit != null ? String(target.exit) : "—"} beforeBad={fromBad} />
          <BeforeAfter label="Cost to leave after" before="—" after={leaveLoss != null ? fmtPct(leaveLoss) : "—"} beforeBad={fromBad} afterColor={lossTone(leaveLoss)} />
        </div>
        <Details>
          {q?.status === "ok" ? (
            <>
              <DetailRow label="Route" value={`Jupiter · ${(q.routeLabels ?? []).join(", ") || "direct"}`} />
              {swapLoss != null && outValue != null && <DetailRow label="You lose to the swap" value={`${usd(Math.max(0, from.valueUsd - outValue))} · ${fmtPct(swapLoss)}`} />}
              <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ink-faint)" }}>
                {swapLoss != null && swapLoss >= BLOCK_AT_PCT
                  ? `${from.symbol} has ${usd(from.liquidityUsd ?? 0, { compact: true })} of depth, so any sale today gives up about ${fmtPct(swapLoss)}. Keeping it keeps the same rights, and Updates tells you if its market comes back.`
                  : `Measured: ${from.symbol} worth ${usd(from.valueUsd)} becomes ${outValue != null ? usd(outValue) : "—"} of ${target.symbol}.`}
              </span>
            </>
          ) : <QuoteState quoting={quoting} status={q?.status} symbol={target.symbol} />}
        </Details>
      </>
    );
    footer = action("Review in your wallet", "One signature");
  } else if (blocked) {
    // -------------------------------------------------------------------------------------- blocked
    const back = q?.leaveAgain?.backUi ?? null;
    body = (
      <>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13, background: "var(--danger-bg)", borderRadius: 18, padding: "26px 20px", textAlign: "center" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 999, background: "var(--surface)", color: "var(--danger)" }}>{Icon.lock(24)}</span>
          <span style={{ ...DISPLAY, fontSize: 19, fontWeight: 700, color: "var(--danger)", lineHeight: 1.25 }}>
            {quoting ? "Measuring the way back out…" : back != null ? <>{usd(pay)} in,<br />about {usd(back)} back out</> : q?.status === "no-route" ? "No route in at this size" : "You couldn't sell this back"}
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.55, color: "var(--danger-deep)" }}>
            {usd(target.liquidityUsd, { compact: true })} of liquidity.
            {leaveLoss != null ? ` We quoted buying ${usd(pay)} and selling it straight back: ${fmtPct(leaveLoss)} of it is gone.` : target.notRoutableReason ? ` ${target.notRoutableReason}.` : ""}
          </span>
        </div>
        {target.ownership != null && target.exit != null && (
          <div style={{ display: "flex", gap: 10 }}>
            <HalfBox label="Ownership" value={target.ownership} note={target.ownership >= 65 ? "the paperwork is fine" : "little you'd own"} bad={target.ownership < 50} />
            <HalfBox label="Exit" value={target.exit} note={target.exit < 50 ? "the market is not" : "the market is fine"} bad={target.exit < 50} />
          </div>
        )}
        {alt && (
          <div style={{ background: "var(--good-soft)", border: "2px solid var(--grade-a)", borderRadius: 15, padding: "14px 15px" }}>
            <span style={{ fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--grade-a)", fontWeight: 700 }}>Same company, tradable</span>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
              {logo(36)}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 600 }}>{alt.symbol}</span>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{usd(alt.liquidityUsd, { compact: true })} liquidity · {alt.issuer}</span>
              </div>
              <span style={{ flexGrow: 1 }} />
              <GradePill grade={alt.grade} score={alt.score} onWhite />
            </div>
          </div>
        )}
      </>
    );
    footer = (
      <>
        {alt && (
          <button type="button" onClick={() => setMint(alt.mint)} style={{ width: "100%", minHeight: 54, fontSize: 16, fontWeight: 700, color: "var(--action-ink)", background: "var(--action)", border: "none", borderRadius: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Buy {alt.symbol} instead
          </button>
        )}
        <button type="button" onClick={() => setOverride(true)} style={{ width: "100%", marginTop: alt ? 10 : 0, minHeight: 48, fontSize: 13, fontWeight: 600, color: "var(--ink-faint)", background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 15, cursor: "pointer", fontFamily: "inherit" }}>
          Continue with {target.symbol} anyway
        </button>
      </>
    );
  } else {
    // ------------------------------------------------------------------------------------------ buy
    body = (
      <>
        {options.length > 1 && (
          <fieldset disabled={busy} style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <legend style={{ ...LABEL, padding: "0 0 8px" }}>Which token</legend>
            {options.map((o) => {
              const on = o.mint === mint;
              return (
                <label key={o.mint} style={{ display: "flex", alignItems: "center", gap: 11, border: on ? "2px solid var(--grade-a)" : "1px solid var(--hairline)", background: on ? "var(--good-soft)" : "transparent", borderRadius: 15, padding: "13px 14px", cursor: "pointer", minHeight: 48, opacity: on || o.routable ? 1 : 0.75 }}>
                  <input type="radio" name="trova-token" checked={on} onChange={() => { setMint(o.mint); setOverride(false); }} style={{ width: 18, height: 18, accentColor: "var(--grade-a)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ ...DISPLAY, fontSize: 15, fontWeight: 600 }}>{o.symbol}{o.speculative ? <span style={{ fontSize: 11, color: "var(--grade-c)", fontWeight: 700 }}> · Speculative</span> : null}</span>
                    <span style={{ fontSize: 11, color: o.routable ? "var(--ink-faint)" : "var(--danger)", fontWeight: o.routable ? 400 : 600 }}>
                      {o.issuer} · {o.routable ? `${usd(o.liquidityUsd, { compact: true })} liquidity` : o.notRoutableReason ?? "not tradable"}
                    </span>
                  </div>
                  <span style={{ flexGrow: 1 }} />
                  <GradePill grade={o.grade} score={o.score} />
                </label>
              );
            })}
          </fieldset>
        )}

        {target.speculative && (
          <p style={{ margin: 0, borderRadius: 14, padding: "12px 14px", fontSize: 12, lineHeight: 1.5, background: "var(--grade-c-bg)" }}>
            <b style={{ color: "var(--grade-c)" }}>Speculative. </b>{target.instrumentSummary} Its rating updates as information becomes public.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <label htmlFor="trova-amount" style={LABEL}>You pay</label>
            <span style={{ flexGrow: 1 }} />
            {usdcBalance != null && <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Balance {usd(usdcBalance)}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--hairline)", borderRadius: 15, padding: "14px 15px" }}>
            <input id="trova-amount" inputMode="decimal" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              style={{ ...NUM, fontSize: 26, fontWeight: 700, border: "none", outline: "none", width: "100%", minWidth: 0, padding: 0, background: "transparent", color: "var(--ink)" }} />
            <span style={{ background: "var(--track)", borderRadius: 11, padding: "9px 13px", fontSize: 13, fontWeight: 700 }}>USDC</span>
          </div>
          {usdcBalance != null && usdcBalance > 0 && (
            <div style={{ display: "flex", gap: 7 }}>
              {([["25%", 0.25], ["50%", 0.5], ["Max", 1]] as const).map(([l, f]) => (
                <button key={l} type="button" disabled={busy} onClick={() => setAmount((Math.floor(usdcBalance * f * 100) / 100).toFixed(2))}
                  style={{ flexGrow: 1, textAlign: "center", border: "1px solid var(--hairline)", borderRadius: 10, padding: "9px 0", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", background: "var(--surface)", cursor: "pointer", fontFamily: "inherit" }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {usdcBalance != null && pay > usdcBalance && <span style={{ fontSize: 11, color: "var(--grade-c)", fontWeight: 600 }}>More than your {usd(usdcBalance)} USDC — the wallet will refuse it.</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--canvas)", borderRadius: 15, padding: "15px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={LABEL}>You get</span>
            <span style={{ ...NUM, fontSize: 21, fontWeight: 700 }}>{quoting ? "…" : q?.outUi != null ? fmtUnits(q.outUi) : "—"}</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{logo(30)}<span style={{ ...DISPLAY, fontSize: 14, fontWeight: 700 }}>{target.symbol}</span></div>
        </div>

        <Details>
          {q?.status === "ok" ? (
            <>
              <DetailRow label="Price impact" value={`${(q.priceImpactPct ?? 0).toFixed(4)}%`} color={lossTone(q.priceImpactPct ?? 0)} />
              <DetailRow label="Route" value={`Jupiter · ${(q.routeLabels ?? []).join(", ") || "direct"}`} />
              <div style={{ display: "flex", alignItems: "baseline", borderTop: "1px solid var(--track)", paddingTop: 9 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Cost to leave again</span>
                <span style={{ flexGrow: 1 }} />
                <span style={{ ...NUM, fontSize: 14, fontWeight: 700, color: lossTone(leaveLoss) }}>{leaveLoss == null ? "—" : fmtPct(leaveLoss)}</span>
              </div>
              <span style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ink-faint)" }}>
                Measured, not estimated — we quote the sale back at this size. {usd(pay)} in, {q.leaveAgain?.backUi != null ? usd(q.leaveAgain.backUi) : "—"} out.
              </span>
            </>
          ) : <QuoteState quoting={quoting} status={q?.status} symbol={target.symbol} />}
        </Details>
      </>
    );
    footer = action("Review in your wallet", "The only step that asks for a signature");
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="items-end md:items-center" style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", justifyContent: "center" }}>
      <button type="button" aria-label="Close" onClick={() => !busy && onClose()} style={{ position: "absolute", inset: 0, background: "rgba(20,22,26,0.55)", border: "none", cursor: "default" }} />
      <div className="rounded-t-[24px] md:rounded-[24px]" style={{ position: "relative", width: "min(440px, 100vw)", maxHeight: "94vh", overflowY: "auto", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
        <div className="md:hidden" style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}><span style={{ width: 38, height: 4, borderRadius: 999, background: "var(--hairline)" }} /></div>
        <header style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 18px" }}>
          {!from && logo(38)}
          <div style={{ display: "flex", flexDirection: "column", gap: from ? 2 : 1, minWidth: 0 }}>
            <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 600 }}>{title}</span>
            <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{subtitle}</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, marginRight: -6, borderRadius: 12, color: "var(--ink-faint)", background: "transparent", border: "none", cursor: "pointer", opacity: busy ? 0.4 : 1 }}>
            {Icon.close()}
          </button>
        </header>
        <div style={{ padding: "4px 18px 0", display: "flex", flexDirection: "column", gap: from ? 4 : blocked ? 14 : 12 }}>{body}</div>
        {footer && (
          <div style={{ padding: "14px 18px calc(26px + env(safe-area-inset-bottom, 0px))" }}>
            {footer}
            {phase.kind === "failed" && (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--danger)" }}>
                {phase.message}
                {phase.signature && <> · <a href={`https://solscan.io/tx/${phase.signature}`} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>View on Solscan</a></>}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function toRaw(ui: string, decimals: number): string | null {
  const n = Number(ui);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.floor(n * 10 ** decimals)).toString();
}

function Details({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 9, border: "1px solid var(--hairline)", borderRadius: 15, padding: "14px 16px", marginTop: 0 }}>{children}</div>;
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ flexGrow: 1 }} />
      <span style={{ ...NUM, fontSize: 12, fontWeight: 700, color, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function QuoteState({ quoting, status, symbol }: { quoting: boolean; status?: Quote["status"]; symbol: string }) {
  if (quoting || !status) return <div className="animate-pulse" style={{ height: 64, borderRadius: 10, background: "var(--track)" }} />;
  return (
    <span style={{ fontSize: 13, color: status === "no-route" ? "var(--danger)" : "var(--ink-soft)" }}>
      {status === "no-route" ? `Jupiter has no route into ${symbol} at this size.` : "Couldn't reach Jupiter just now. Try again in a moment."}
    </span>
  );
}

function HalfBox({ label, value, note, bad }: { label: string; value: number; note: string; bad: boolean }) {
  const fill = value >= 80 ? "var(--grade-a)" : value >= 65 ? "var(--grade-b)" : value >= 50 ? "var(--grade-c)" : "var(--danger)";
  return (
    <div style={{ flex: 1, border: `1px solid ${bad ? "var(--danger-line)" : "var(--hairline)"}`, borderRadius: 14, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, color: "var(--ink-faint)", fontWeight: 600 }}>{label}</span>
      <span style={{ ...NUM, fontSize: 19, fontWeight: 700, color: bad ? "var(--danger)" : undefined }}>{value}</span>
      <div style={{ height: 5, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}><div style={{ width: `${value}%`, height: 5, background: fill }} /></div>
      <span style={{ fontSize: 10, color: bad ? "var(--danger)" : "var(--ink-faint)", fontWeight: bad ? 600 : 400 }}>{note}</span>
    </div>
  );
}

function BeforeAfter({ label, before, after, beforeBad, afterColor = "var(--grade-a)" }: { label: string; before: string; after: string; beforeBad: boolean; afterColor?: string }) {
  return (
    <div style={{ flex: 1, border: "1px solid var(--hairline)", borderRadius: 14, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, color: "var(--ink-faint)", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ ...NUM, fontSize: 17, fontWeight: 700, color: beforeBad ? "var(--danger)" : "var(--ink)" }}>{before}</span>
        <span style={{ color: "var(--ink-faint)", display: "flex", alignSelf: "center" }}>{Icon.chevronRight(13)}</span>
        <span style={{ ...NUM, fontSize: 17, fontWeight: 700, color: afterColor }}>{after}</span>
      </div>
    </div>
  );
}

/**
 * Builds the unsigned transaction on our server (fresh quote, our terms), hands it to the wallet
 * to sign AND send, then watches the signature until the chain answers. Trova never holds a key or
 * a signed transaction.
 */
function SendButton({ account, disabled, phase, setPhase, request, label, note }: {
  account: NonNullable<ReturnType<typeof useConnectedWallet>>["account"];
  disabled: boolean;
  phase: Phase;
  setPhase: (p: Phase) => void;
  request: { inputMint: string; outputMint: string; amount: string; slippageBps: number };
  label: string;
  note: string;
}) {
  const signer = useWalletAccountTransactionSendingSigner(account, "solana:mainnet");

  async function go() {
    try {
      setPhase({ kind: "building" });
      const built = await api<{ swapTransaction: string }>("/api/swap", {
        method: "POST",
        body: JSON.stringify({ ...request, userPublicKey: account.address }),
      });
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(built.swapTransaction));
      setPhase({ kind: "signing" });
      const [sig] = await signer.signAndSendTransactions([tx]);
      const signature = getBase58Decoder().decode(sig);
      setPhase({ kind: "sent", signature });
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await api<{ status: string }>(`/api/tx?signature=${signature}`).catch(() => ({ status: "unknown" }));
        if (s.status === "confirmed" || s.status === "finalized") { setPhase({ kind: "done", signature }); return; }
        if (s.status === "failed") { setPhase({ kind: "failed", message: "The trade failed on-chain and nothing changed hands.", signature }); return; }
      }
      setPhase({ kind: "failed", message: "Not confirmed after a minute. It may still land — check before trying again.", signature });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhase({ kind: "failed", message: /reject|cancel|denied|declined/i.test(msg) ? "You cancelled in your wallet. Nothing was sent." : `Couldn't complete the trade: ${msg}` });
    }
  }

  const text = phase.kind === "building" ? "Preparing the trade…" : phase.kind === "signing" ? "Confirm in your wallet…" : label;
  return (
    <>
      <button type="button" onClick={go} disabled={disabled}
        style={{ width: "100%", minHeight: 54, fontSize: 16, fontWeight: 700, color: "var(--action-ink)", background: "var(--action)", border: "none", borderRadius: 15, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "inherit" }}>
        {text}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 11, color: "var(--ink-faint)" }}>
        {Icon.lock(12)}
        <span style={{ fontSize: 11 }}>{note}</span>
      </div>
    </>
  );
}

function Result({ phase, symbol, onClose }: { phase: Extract<Phase, { kind: "sent" | "done" }>; symbol: string; onClose: () => void }) {
  const home = useHomeHref();
  const done = phase.kind === "done";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0 30px", textAlign: "center" }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 999, background: done ? "var(--grade-a-bg)" : "var(--canvas)", color: "var(--grade-a)" }}>
        {done ? Icon.check(24) : <span className="animate-spin" style={{ width: 24, height: 24, borderRadius: 999, border: "2px solid var(--hairline)", borderTopColor: "var(--ink)" }} />}
      </span>
      <span style={{ ...DISPLAY, fontSize: 18, fontWeight: 700 }}>{done ? `You own ${symbol}` : "Sent — waiting for the chain"}</span>
      <a href={`https://solscan.io/tx/${phase.signature}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", textDecoration: "underline" }}>View on Solscan</a>
      {done && (
        <div style={{ display: "flex", gap: 8, paddingTop: 6 }}>
          <Link href={home} onClick={onClose} style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", textDecoration: "none" }}>See your portfolio</Link>
          <button type="button" onClick={onClose} style={{ height: 44, padding: "0 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
      )}
    </div>
  );
}
