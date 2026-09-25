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

export function ConnectButton({ size = "md" }: { size?: "md" | "lg" }) {
  const ready = useIsWalletReady(solanaClient);
  const wallets = useWallets(solanaClient);
  const connected = useConnectedWallet(solanaClient);
  const connect = useConnect(solanaClient);
  const disconnect = useDisconnect(solanaClient);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  const big = size === "lg";
  const base = big
    ? "h-14 w-full rounded-[15px] px-6 text-[16px]"
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

  const busy = !ready || connect.status === "running";
  return (
    <div ref={ref} className={`relative ${big ? "w-full" : ""}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`${base} inline-flex items-center justify-center gap-2 font-bold disabled:opacity-60`}
        style={{ background: "var(--action)", color: "var(--action-ink)" }}
        aria-expanded={open}
      >
        {connect.status === "running" ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div
          className={`absolute z-50 mt-2 flex flex-col gap-1 rounded-[14px] p-2 ${big ? "left-0 right-0" : "right-0 w-64"}`}
          style={{ background: "var(--surface)", border: "1px solid var(--hairline)", boxShadow: "0 12px 32px rgba(20,22,26,0.14)" }}
        >
          {wallets.length === 0 ? (
            <div className="flex flex-col gap-2 p-3">
              <span className="text-[13px] font-semibold">No Solana wallet in this browser</span>
              <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>Install one, then come back:</span>
              <div className="flex flex-wrap gap-2">
                {INSTALL.map((w) => (
                  <a key={w.name} href={w.url} target="_blank" rel="noreferrer" className="rounded-[9px] px-3 py-1.5 text-[12px] font-semibold" style={{ border: "1px solid var(--hairline)" }}>
                    {w.name}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            wallets.map((w) => (
              <button
                key={w.name}
                type="button"
                onClick={() => { setOpen(false); connect.dispatch(w); }}
                className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold hover:bg-[var(--canvas)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" width={22} height={22} className="rounded-[6px]" />
                {w.name}
              </button>
            ))
          )}
          {connect.error != null && (
            <span className="px-3 pb-2 text-[12px]" style={{ color: "var(--danger)" }}>
              The wallet didn&apos;t connect. Try again, or pick another.
            </span>
          )}
          <span className="px-3 pb-2 pt-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>
            We only read your public address. You sign nothing to look.
          </span>
        </div>
      )}
    </div>
  );
}
