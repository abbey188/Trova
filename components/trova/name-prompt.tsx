"use client";

// The first time a wallet opens its home, ask what to call you — once. The name is kept for this
// device (like the watchlist), never tied to the wallet: tying it to an address without a signature
// would let anyone rename anyone's wallet, and looking never asks for a signature.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { DISPLAY } from "@/components/trova/kit";
import { api } from "@/lib/client";

const asked = (address: string) => `trova:name-asked:${address}`;

export function NamePrompt({ address }: { address: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => {
    try { if (!localStorage.getItem(asked(address))) setOpen(true); } catch { /* storage blocked: don't nag */ }
  }, [address]);
  const done = () => {
    try { localStorage.setItem(asked(address), "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  const save = useMutation({
    mutationFn: (nickname: string) => api("/api/me", { method: "PUT", device: true, body: JSON.stringify({ nickname }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); done(); },
  });
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="What should we call you?" style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <button type="button" aria-label="Skip" onClick={done} style={{ position: "absolute", inset: 0, border: "none", cursor: "default", background: "rgba(20,22,26,0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(name.trim()); }}
        style={{ position: "relative", width: "min(400px, 100%)", background: "var(--surface)", borderRadius: 22, padding: "26px 22px 20px", boxShadow: "0 24px 64px rgba(20,22,26,0.28)", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ ...DISPLAY, fontSize: 21, fontWeight: 700 }}>You&apos;re in. What should we call you?</span>
          <span style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>So your home says your name, not a wallet address. Saved on this device — change it any time in Profile.</span>
        </div>
        <label htmlFor="trova-first-name" className="sr-only">Your name</label>
        <input id="trova-first-name" autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="A first name is plenty"
          style={{ height: 50, borderRadius: 13, border: "1px solid var(--hairline)", padding: "0 14px", fontSize: 15, background: "var(--canvas)", color: "var(--ink)", outline: "none", fontFamily: "inherit" }} />
        {save.isError && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Couldn&apos;t save it just now. Try again, or skip and add it in Profile.</span>}
        <button type="submit" disabled={!name.trim() || save.isPending}
          style={{ height: 52, borderRadius: 14, border: "none", fontSize: 15, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", cursor: "pointer", opacity: !name.trim() ? 0.5 : 1, fontFamily: "inherit" }}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={done} style={{ height: 40, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "var(--ink-faint)", cursor: "pointer", fontFamily: "inherit" }}>Skip for now</button>
      </form>
    </div>,
    document.body,
  );
}
