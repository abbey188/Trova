"use client";

import { getBase58Decoder, getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { solanaClient } from "@/app/providers";
import { GradeBadge } from "@/components/trova/grade-badge";
import { ConnectButton } from "@/components/trova/wallet";
import { api } from "@/lib/client";
import { usd } from "@/lib/format";
import type { Rating } from "@/lib/types";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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
}

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

/** "From" for a swap out of a token the wallet already holds; absent for a buy with USDC. */
export interface SwapFrom { mint: string; symbol: string; rawAmount: string; decimals: number; valueUsd: number }

export function TradeSheet({
  open,
  onClose,
  assetName,
  options,
  defaultMint,
  from,
}: {
  open: boolean;
  onClose: () => void;
  assetName: string;
  options: TokenOption[];
  defaultMint: string;
  from?: SwapFrom;
}) {
  const [mint, setMint] = useState(defaultMint);
  const [amount, setAmount] = useState(from ? "" : "25");
  const [debounced, setDebounced] = useState(amount);
  const [override, setOverride] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const connected = useConnectedWallet(solanaClient);

  useEffect(() => { setMint(defaultMint); setOverride(false); setPhase({ kind: "idle" }); }, [defaultMint, open]);
  useEffect(() => { const t = setTimeout(() => setDebounced(amount), 350); return () => clearTimeout(t); }, [amount]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && phase.kind !== "signing") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, phase.kind]);

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
  const outValue = q?.outUi != null ? q.outUi * target.priceUsd : null;
  const leaveLoss = q?.leaveAgain?.roundTripPct ?? null;
  const swapLoss = from && outValue != null && from.valueUsd > 0 ? Math.max(0, (1 - outValue / from.valueUsd) * 100) : null;
  const blocked = !from && !override && (!target.routable || (leaveLoss != null && leaveLoss >= 10));
  const busy = phase.kind === "building" || phase.kind === "signing" || phase.kind === "sent";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={from ? `Move out of ${from.symbol}` : `Buy ${assetName}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" style={{ background: "rgba(20,22,26,0.45)" }} onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[92vh] w-full max-w-[460px] flex-col gap-4 overflow-auto rounded-t-[24px] p-5 md:rounded-[22px]" style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-display text-[18px] font-semibold">{from ? `Move out of ${from.symbol}` : `Buy ${assetName}`}</span>
            <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>
              {from ? "Same company, a token you can leave" : `${options.length} token${options.length === 1 ? "" : "s"} track this company`}
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="ml-auto flex h-10 w-10 items-center justify-center rounded-[12px] disabled:opacity-40" style={{ color: "var(--ink-faint)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {phase.kind === "done" || phase.kind === "sent" ? (
          <Result phase={phase} symbol={target.symbol} onClose={onClose} />
        ) : (
          <>
            <fieldset className="flex flex-col gap-2" disabled={busy}>
              <legend className="pb-2 text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>{from ? "Into" : "Which token"}</legend>
              {options.map((o) => (
                <label
                  key={o.mint}
                  className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3"
                  style={{ border: o.mint === mint ? "2px solid var(--grade-a)" : "1px solid var(--hairline)", background: o.mint === mint ? "var(--grade-a-bg)" : "transparent" }}
                >
                  <input type="radio" name="trova-token" checked={o.mint === mint} onChange={() => { setMint(o.mint); setOverride(false); }} className="h-4 w-4 accent-[var(--grade-a)]" />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-display text-[14px] font-semibold">{o.symbol}{o.speculative ? " · Speculative" : ""}</span>
                    <span className="text-[11px]" style={{ color: o.routable ? "var(--ink-faint)" : "var(--danger)" }}>
                      {o.issuer} · {o.routable ? `${usd(o.liquidityUsd, { compact: true })} liquidity` : o.notRoutableReason ?? "not tradable"}
                    </span>
                  </div>
                  <span className="ml-auto"><GradeBadge grade={o.grade} score={o.score} size="sm" /></span>
                </label>
              ))}
            </fieldset>

            {target.speculative && (
              <p className="rounded-[14px] p-3.5 text-[12px] leading-relaxed" style={{ background: "var(--grade-c-bg)", color: "var(--ink)" }}>
                <b style={{ color: "var(--grade-c)" }}>Speculative. </b>{target.instrumentSummary}
              </p>
            )}

            {from ? (
              <div className="flex items-center gap-3 rounded-[14px] p-4" style={{ background: "var(--canvas)" }}>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold" style={{ color: "var(--ink-faint)" }}>You give</span>
                  <span className="font-display tabular text-[18px] font-bold">{Number(from.rawAmount) / 10 ** from.decimals} {from.symbol}</span>
                </div>
                <span className="ml-auto tabular text-[13px]" style={{ color: "var(--ink-soft)" }}>{usd(from.valueUsd)}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="trova-amount" className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>You pay</label>
                <div className="flex items-center gap-3 rounded-[14px] px-4 py-3" style={{ border: "1px solid var(--hairline)" }}>
                  <input
                    id="trova-amount"
                    inputMode="decimal"
                    value={amount}
                    disabled={busy}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="font-display tabular w-full bg-transparent text-[26px] font-bold outline-none"
                  />
                  <span className="rounded-[10px] px-3 py-2 text-[13px] font-bold" style={{ background: "var(--canvas)" }}>USDC</span>
                </div>
              </div>
            )}

            <QuoteBox quote={quote.isFetching && !q ? null : q} loading={quote.isPending && quote.fetchStatus !== "idle"} target={target} from={from} outValue={outValue} leaveLoss={leaveLoss} swapLoss={swapLoss} pay={Number(debounced) || 0} />

            {blocked && best && best.mint !== target.mint ? (
              <div className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-line)" }}>
                <span className="font-display text-[16px] font-bold" style={{ color: "var(--danger)" }}>
                  {leaveLoss != null ? `${usd(Number(debounced) || 0)} in, about ${usd((Number(debounced) || 0) * (1 - leaveLoss / 100))} back out` : "You couldn't sell this back"}
                </span>
                <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  {usd(target.liquidityUsd, { compact: true })} of liquidity. {best.symbol} tracks the same company and is rated {best.grade} {best.score}.
                </span>
                <button type="button" onClick={() => setMint(best.mint)} className="h-12 rounded-[14px] text-[15px] font-bold" style={{ background: "var(--action)", color: "var(--action-ink)" }}>
                  Buy {best.symbol} instead
                </button>
                <button type="button" onClick={() => setOverride(true)} className="h-11 rounded-[14px] text-[13px] font-semibold" style={{ border: "1px solid var(--hairline)", color: "var(--ink-soft)", background: "var(--surface)" }}>
                  Continue with {target.symbol} anyway
                </button>
              </div>
            ) : !connected ? (
              <div className="flex flex-col gap-2">
                <ConnectButton size="lg" />
                <span className="text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>Connect to trade. Looking never needs a signature.</span>
              </div>
            ) : connected.signer == null ? (
              <span className="text-[12px]" style={{ color: "var(--danger)" }}>This wallet is read-only here, so it can&apos;t sign a trade.</span>
            ) : (
              <SendButton
                account={connected.account}
                disabled={q?.status !== "ok" || busy}
                phase={phase}
                setPhase={setPhase}
                request={{ inputMint, outputMint: target.mint, amount: rawIn ?? "0", slippageBps: from ? 100 : 50 }}
              />
            )}

            {phase.kind === "failed" && (
              <span className="text-[12px]" style={{ color: "var(--danger)" }}>
                {phase.message}
                {phase.signature && <> · <a href={`https://solscan.io/tx/${phase.signature}`} target="_blank" rel="noreferrer" className="underline">View on Solscan</a></>}
              </span>
            )}
          </>
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

function QuoteBox({ quote, loading, target, from, outValue, leaveLoss, swapLoss, pay }: {
  quote: Quote | null | undefined; loading: boolean; target: TokenOption; from?: SwapFrom;
  outValue: number | null; leaveLoss: number | null; swapLoss: number | null; pay: number;
}) {
  if (loading) return <div className="h-[132px] animate-pulse rounded-[14px]" style={{ background: "var(--canvas)" }} />;
  if (!quote) return null;
  if (quote.status !== "ok") {
    return (
      <div className="rounded-[14px] p-4 text-[13px]" style={{ background: "var(--canvas)", color: quote.status === "no-route" ? "var(--danger)" : "var(--ink-soft)" }}>
        {quote.status === "no-route" ? `Jupiter has no route into ${target.symbol} at this size.` : "Couldn't reach Jupiter just now. Try again in a moment."}
      </div>
    );
  }
  const tone = (pct: number | null) => (pct == null ? "var(--ink)" : pct >= 10 ? "var(--danger)" : pct >= 1 ? "var(--grade-c)" : "var(--grade-a)");
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] p-4" style={{ border: "1px solid var(--hairline)" }}>
      <div className="flex items-baseline">
        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>You get</span>
        <span className="font-display tabular ml-auto text-[18px] font-bold">{quote.outUi?.toLocaleString("en-US", { maximumFractionDigits: 6 })} {target.symbol}</span>
      </div>
      {outValue != null && <Row label="Worth about" value={usd(outValue)} />}
      <Row label="Price impact" value={`${(quote.priceImpactPct ?? 0).toFixed(4)}%`} />
      <Row label="Route" value={`Jupiter · ${(quote.routeLabels ?? []).join(", ") || "direct"}`} />
      <div className="flex items-baseline pt-2" style={{ borderTop: "1px solid var(--hairline)" }}>
        <span className="text-[13px] font-bold">{from ? "You give up" : "Cost to leave again"}</span>
        <span className="font-display tabular ml-auto text-[15px] font-bold" style={{ color: tone(from ? swapLoss : leaveLoss) }}>
          {from ? (swapLoss == null ? "—" : `${swapLoss.toFixed(2)}%`) : leaveLoss == null ? "—" : `${leaveLoss.toFixed(2)}%`}
        </span>
      </div>
      <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
        {from
          ? `Measured: ${from.symbol} worth ${usd(from.valueUsd)} becomes ${outValue != null ? usd(outValue) : "—"} of ${target.symbol}.`
          : `Measured, not estimated — we quote the sale straight back. ${usd(pay)} in, ${quote.leaveAgain?.backUi != null ? usd(quote.leaveAgain.backUi) : "—"} out.`}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline text-[12px]">
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      <span className="tabular ml-auto font-semibold">{value}</span>
    </div>
  );
}

/**
 * Builds the unsigned transaction on our server (fresh quote, our terms), hands it to the wallet
 * to sign AND send, then watches the signature until the chain answers. Trova never holds a key or
 * a signed transaction.
 */
function SendButton({ account, disabled, phase, setPhase, request }: {
  account: NonNullable<ReturnType<typeof useConnectedWallet>>["account"];
  disabled: boolean;
  phase: Phase;
  setPhase: (p: Phase) => void;
  request: { inputMint: string; outputMint: string; amount: string; slippageBps: number };
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

  const label =
    phase.kind === "building" ? "Preparing the trade…"
    : phase.kind === "signing" ? "Confirm in your wallet…"
    : "Review in your wallet";
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={go} disabled={disabled} className="h-14 rounded-[15px] text-[16px] font-bold disabled:opacity-50" style={{ background: "var(--action)", color: "var(--action-ink)" }}>
        {label}
      </button>
      <span className="inline-flex items-center justify-center gap-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        The only step that asks for a signature
      </span>
    </div>
  );
}

function Result({ phase, symbol, onClose }: { phase: Extract<Phase, { kind: "sent" | "done" }>; symbol: string; onClose: () => void }) {
  const done = phase.kind === "done";
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: done ? "var(--grade-a-bg)" : "var(--canvas)" }}>
        {done ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--grade-a)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <span className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--hairline)", borderTopColor: "var(--ink)" }} />
        )}
      </span>
      <span className="font-display text-[18px] font-bold">{done ? `You own ${symbol}` : "Sent — waiting for the chain"}</span>
      <a href={`https://solscan.io/tx/${phase.signature}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold underline">View on Solscan</a>
      {done && (
        <div className="flex gap-2 pt-2">
          <Link href="/" className="h-11 rounded-[12px] px-4 py-3 text-[13px] font-bold" style={{ background: "var(--action)", color: "var(--action-ink)" }}>See your portfolio</Link>
          <button type="button" onClick={onClose} className="h-11 rounded-[12px] px-4 text-[13px] font-semibold" style={{ border: "1px solid var(--hairline)" }}>Close</button>
        </div>
      )}
    </div>
  );
}
