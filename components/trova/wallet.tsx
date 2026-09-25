"use client";

import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { solanaClient } from "@/app/providers";
import { shortAddress } from "@/lib/client";

/** The connected wallet's address, or null. Reading it asks for nothing — no signature, ever. */
export function useWalletAddress(): string | null {
  const connected = useConnectedWallet(solanaClient);
  return connected?.account.address ?? null;
}

const INSTALL = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
];

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

export function ConnectButton({ size = "md" }: { size?: "md" | "lg" | "hero" }) {
  const ready = useIsWalletReady(solanaClient);
  const wallets = useWallets(solanaClient);
  const connected = useConnectedWallet(solanaClient);
  const connect = useConnect(solanaClient);
  const disconnect = useDisconnect(solanaClient);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  const big = size === "lg";
  const base =
    size === "lg" ? "h-14 w-full rounded-[15px] px-6 text-[16px]"
    : size === "hero" ? "h-[54px] rounded-[13px] px-[30px] text-[15px]"
    : "h-10 rounded-[11px] px-4 text-[13px]";

  if (connected) {
    const address = connected.account.address;
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${base} inline-flex items-center gap-2 font-semibold`}
          style={{ border: "1px solid var(--hairline)", color: "var(--ink)", background: "var(--surface)" }}
          aria-expanded={open}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--grade-a)" }} />
          <span className="tabular">{shortAddress(address)}</span>
        </button>
        {open && (
          <div
            className="absolute right-0 z-50 mt-2 flex w-56 flex-col gap-1 rounded-[14px] p-2"
            style={{ background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 12px 32px rgba(20,22,26,0.14)" }}
          >
            <span className="px-3 pb-1 pt-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
              {connected.wallet.name} · read by address only
            </span>
            <Link href={`/p/${address}`} onClick={() => setOpen(false)} className="rounded-[10px] px-3 py-2.5 text-[13px] font-semibold hover:bg-[var(--canvas)]">
              Your portfolio
            </Link>
            <Link href="/profile" onClick={() => setOpen(false)} className="rounded-[10px] px-3 py-2.5 text-[13px] font-semibold hover:bg-[var(--canvas)]">
              Name and alerts
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); disconnect.dispatch(); }}
              className="rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold hover:bg-[var(--canvas)]"
              style={{ color: "var(--danger)" }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  const busy = connect.status === "running";
  return (
    <div className={big ? "w-full" : ""}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${base} inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold`}
        style={{ background: "var(--action)", color: "var(--action-ink)", cursor: "pointer" }}
        aria-haspopup="dialog"
      >
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
      {open && <ConnectModal ready={ready} wallets={wallets} error={connect.error != null} onPick={(w) => { setOpen(false); connect.dispatch(w); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

type WalletList = ReturnType<typeof useWallets>;

/**
 * The wallet picker: centred, the page behind blurred, closed by a tap outside or Escape. It opens
 * the moment the button is tapped — while the browser is still announcing its wallets it says so,
 * instead of the button silently ignoring the tap.
 */
function ConnectModal({ ready, wallets, error, onPick, onClose }: {
  ready: boolean; wallets: WalletList; error: boolean; onPick: (w: WalletList[number]) => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Connect a wallet" style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", inset: 0, border: "none", cursor: "default", background: "rgba(20,22,26,0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
      <div style={{ position: "relative", width: "min(420px, 100%)", background: "var(--surface)", borderRadius: 22, padding: "24px 22px 20px", boxShadow: "0 24px 64px rgba(20,22,26,0.28)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display), system-ui", fontSize: 20, fontWeight: 700 }}>Connect a wallet</span>
            <span style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>We only read your public address. You sign nothing to look — a signature is asked for only when you trade.</span>
          </div>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, marginTop: -6, marginRight: -6, borderRadius: 10, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {!ready && wallets.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 14px", borderRadius: 14, background: "var(--canvas)", fontSize: 13, color: "var(--ink-soft)" }}>
            <span className="animate-spin" style={{ width: 16, height: 16, borderRadius: 999, border: "2px solid var(--hairline)", borderTopColor: "var(--ink)" }} />
            Looking for wallets in this browser…
          </div>
        ) : wallets.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 14, background: "var(--canvas)" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>No Solana wallet in this browser</span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Install one, then come back:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INSTALL.map((w) => (
                <a key={w.name} href={w.url} target="_blank" rel="noreferrer" style={{ borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>{w.name}</a>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {wallets.map((w) => (
              <button key={w.name} type="button" onClick={() => onPick(w)} className="hover:bg-[var(--canvas)]"
                style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 58, padding: "0 16px", borderRadius: 14, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 600, textAlign: "left" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" width={32} height={32} style={{ borderRadius: 9 }} />
                {w.name}
                <span style={{ flexGrow: 1 }} />
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>Detected</span>
              </button>
            ))}
          </div>
        )}
        {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>The wallet didn&apos;t connect. Try again, or pick another.</span>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 11, color: "var(--ink-faint)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          Read-only until you choose to trade
        </div>
      </div>
    </div>,
    document.body,
  );
}
