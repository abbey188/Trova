"use client";

// The app frame from the canvas: a 76px rail on desktop (logo, Home, Markets, Updates, then the ?
// and the theme switch at the bottom) and a bottom nav on mobile (Home, Markets, Updates, Profile).
// Flow rules it enforces: the logo and Home always go to YOUR home — the connected wallet's
// portfolio, or the demo portfolio — never back to Connect; the ? opens a panel, never a page.

import Link from "next/link";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { HelpContent } from "@/components/trova/help-content";
import { DISPLAY, Icon } from "@/components/trova/kit";
import { ProfileContent } from "@/components/trova/profile";
import { api } from "@/lib/client";
import { useWalletAddress } from "@/components/trova/wallet";

export type Section = "home" | "markets" | "updates" | "profile" | "none";

/** Where "home" is right now: your portfolio when a wallet is connected, the demo otherwise. */
export function useHomeHref(): string {
  const address = useWalletAddress();
  return address ? `/p/${address}` : "/p/demo";
}

// ---------------------------------------------------------------------------- the ? panel

const HelpCtx = createContext<() => void>(() => {});
export const useOpenHelp = () => useContext(HelpCtx);

export function Sheet({ open, onClose, children, label, side = "right", width = 520 }: { open: boolean; onClose: () => void; children: ReactNode; label: string; side?: "right" | "bottom"; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={label} style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", justifyContent: side === "right" ? "flex-end" : "center", alignItems: side === "right" ? "stretch" : "flex-end" }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,22,26,0.42)", border: "none", cursor: "default" }} />
      <div
        style={{
          position: "relative", background: "var(--surface)", overflowY: "auto",
          ...(side === "right"
            ? { width: `min(${width}px, 100vw)`, height: "100%", borderRadius: "22px 0 0 22px" }
            : { width: "min(560px, 100vw)", maxHeight: "92vh", borderRadius: "24px 24px 0 0", paddingBottom: "env(safe-area-inset-bottom, 0px)" }),
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- frame

function RailLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 56, padding: "9px 0", marginTop: 6, borderRadius: 12, textDecoration: "none", background: active ? "var(--ink)" : "transparent", color: active ? "var(--surface)" : "var(--ink-faint)" }}
    >
      {children}
      <span style={{ fontSize: 9, fontWeight: active ? 700 : 600 }}>{label}</span>
    </Link>
  );
}

export function AppFrame({ active, children }: { active: Section; children: ReactNode }) {
  const home = useHomeHref();
  const address = useWalletAddress();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The icon shows where a tap takes you: a sun in dark mode, a moon in light.
  const dark = mounted && resolvedTheme === "dark";
  const [help, setHelp] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);

  return (
    <HelpCtx.Provider value={openHelp}>
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex" }}>
        <nav aria-label="Main" className="hidden lg:flex" style={{ position: "sticky", top: 0, height: "100vh", width: 76, flexShrink: 0, background: "var(--surface)", borderRight: "1px solid var(--hairline)", flexDirection: "column", alignItems: "center", padding: "20px 0 18px", boxSizing: "border-box" }}>
          <Link href={home} aria-label="Trova — home" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 11, background: "var(--action)" }}>
            {Icon.logo(20)}
          </Link>
          <span style={{ height: 20 }} />
          <RailLink href={home} label="Home" active={active === "home"}>{Icon.home()}</RailLink>
          <RailLink href="/markets" label="Markets" active={active === "markets"}>{Icon.markets()}</RailLink>
          <RailLink href="/updates" label="Updates" active={active === "updates"}>{Icon.updates()}</RailLink>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={openHelp} aria-label="How ratings work" style={{ ...DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, border: "1.5px solid var(--ring-line)", background: "transparent", color: "var(--ink-soft)", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>?</button>
          <button type="button" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, marginTop: 10, borderRadius: 11, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}>
            {dark ? Icon.sun() : Icon.moon()}
          </button>
        </nav>

        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }} className="pb-[76px] lg:pb-0">
          {children}
        </div>

        <nav aria-label="Main" className="flex lg:hidden" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, background: "var(--surface)", borderTop: "1px solid var(--hairline)", padding: "9px 6px calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          {([
            ["home", home, "Home", Icon.home(21)],
            ["markets", "/markets", "Markets", Icon.markets(21)],
            ["updates", "/updates", "Updates", Icon.updates(21)],
          ] as const).map(([key, href, label, icon]) => (
            <Link key={key} href={href} aria-current={active === key ? "page" : undefined} style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0", minHeight: 44, textDecoration: "none", color: active === key ? "var(--ink)" : "var(--ink-faint)" }}>
              {icon}
              <span style={{ fontSize: 10, fontWeight: active === key ? 700 : 600 }}>{label}</span>
            </Link>
          ))}
          <Link href="/profile" aria-current={active === "profile" ? "page" : undefined} style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0", minHeight: 44, textDecoration: "none", color: active === "profile" ? "var(--ink)" : "var(--ink-faint)" }}>
            <Avatar size={21} address={address} />
            <span style={{ fontSize: 10, fontWeight: active === "profile" ? 700 : 600 }}>Profile</span>
          </Link>
        </nav>
      </div>

      <Sheet open={help} onClose={() => setHelp(false)} label="How ratings work" width={940}>
        <HelpContent onClose={() => setHelp(false)} />
      </Sheet>
    </HelpCtx.Provider>
  );
}

/** The name saved on this device (Profile / the first-connect prompt), shared by every avatar. */
export function useNickname(): string | null {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ nickname: string | null }>("/api/me", { device: true }), retry: false, staleTime: 300_000 });
  return me.data?.nickname?.trim() || null;
}

/**
 * The avatar: your name's first letter on the canvas's pale green disc — the same letter on every
 * screen — else the address's. Pass `name` to override (another wallet's home shows no name).
 */
export function Avatar({ size = 40, name, address }: { size?: number; name?: string | null; address?: string | null }) {
  const saved = useNickname();
  const letter = ((name === undefined ? saved : name)?.[0] ?? address?.[0] ?? "T").toUpperCase();
  return (
    <span aria-hidden="true" style={{ ...DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 999, background: "var(--avatar)", color: "var(--avatar-ink)", fontSize: Math.round(size * 0.38), fontWeight: 700, flexShrink: 0 }}>
      {letter}
    </span>
  );
}

/** The ? as a button anywhere — mobile headers carry one top-right, as on the boards. */
export function HelpButton({ size = 36 }: { size?: number }) {
  const open = useOpenHelp();
  return (
    <button type="button" onClick={open} aria-label="How ratings work" style={{ ...DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 999, border: "1.5px solid var(--hairline)", background: "transparent", color: "var(--ink-faint)", fontSize: 15, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>?</button>
  );
}

/** The header avatar on desktop: opens the profile panel (nickname, address, theme, disconnect). */
export function ProfileAvatarButton({ size = 40 }: { size?: number }) {
  const address = useWalletAddress();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Profile" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", borderRadius: 999 }}>
        <Avatar size={size} address={address} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Profile">
        <ProfileContent onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
