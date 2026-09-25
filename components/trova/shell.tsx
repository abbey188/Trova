import Link from "next/link";
import type { ReactNode } from "react";

import { SearchBox } from "@/components/trova/search";
import { ConnectButton } from "@/components/trova/wallet";

type Section = "home" | "markets" | "updates" | "help" | "profile";

const ICONS: Record<"home" | "markets" | "updates", ReactNode> = {
  home: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></svg>
  ),
  markets: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
  ),
  updates: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5l3 2" /></svg>
  ),
};

const NAV: { key: "home" | "markets" | "updates"; href: string; label: string }[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "markets", href: "/markets", label: "Markets" },
  { key: "updates", href: "/updates", label: "Updates" },
];

function RailLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex w-14 flex-col items-center gap-1 rounded-[12px] py-2 transition-colors"
      style={active ? { background: "var(--ink)", color: "var(--surface)" } : { color: "var(--ink-faint)" }}
    >
      {children}
      <span className="text-[9px] font-semibold">{label}</span>
    </Link>
  );
}

/** The app frame: rail on desktop, bottom nav on mobile, a header with search and the wallet. */
export function Shell({
  title,
  subtitle,
  actions,
  active = "markets",
  back,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  active?: Section | "portfolio" | "changes";
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  const section: Section = active === "portfolio" ? "home" : active === "changes" ? "updates" : active;
  return (
    <div className="min-h-screen" style={{ background: "var(--canvas)" }}>
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <nav
          aria-label="Main"
          className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-1.5 py-5 md:flex"
          style={{ background: "var(--surface)", borderRight: "1px solid var(--hairline)" }}
        >
          <Link href="/" aria-label="Trova home" className="mb-5 flex h-[38px] w-[38px] items-center justify-center rounded-[11px]" style={{ background: "var(--action)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--action-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
          </Link>
          {NAV.map((n) => (
            <RailLink key={n.key} href={n.href} label={n.label} active={section === n.key}>{ICONS[n.key]}</RailLink>
          ))}
          <span className="flex-1" />
          <Link
            href="/help"
            aria-label="How ratings work"
            className="font-display flex h-[38px] w-[38px] items-center justify-center rounded-full text-[17px] font-bold"
            style={section === "help" ? { background: "var(--ink)", color: "var(--surface)" } : { border: "1.5px solid var(--hairline)", color: "var(--ink-soft)" }}
          >
            ?
          </Link>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header
            className="sticky top-0 z-40 flex flex-wrap items-center gap-3 px-4 py-3 md:px-7 md:py-4"
            style={{ background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              {back && (
                <Link href={back.href} className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--ink-soft)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  {back.label}
                </Link>
              )}
              <div className="font-display truncate text-[19px] font-semibold">{title}</div>
              {subtitle && <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{subtitle}</div>}
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              <SearchBox className="hidden w-[300px] lg:block" />
              {actions}
              <ConnectButton />
            </div>
          </header>
          <div className="px-4 pt-3 lg:hidden">
            <SearchBox />
          </div>
          <main className="flex-1 px-4 py-4 md:px-7 md:py-6">{children}</main>
        </div>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex md:hidden"
        style={{ background: "var(--surface)", borderTop: "1px solid var(--hairline)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            aria-current={section === n.key ? "page" : undefined}
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1"
            style={{ color: section === n.key ? "var(--ink)" : "var(--ink-faint)" }}
          >
            {ICONS[n.key]}
            <span className="text-[10px] font-semibold">{n.label}</span>
          </Link>
        ))}
        <Link
          href="/help"
          aria-current={section === "help" ? "page" : undefined}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1"
          style={{ color: section === "help" ? "var(--ink)" : "var(--ink-faint)" }}
        >
          <span className="font-display flex h-[19px] w-[19px] items-center justify-center rounded-full text-[12px] font-bold" style={{ border: "1.5px solid currentColor" }}>?</span>
          <span className="text-[10px] font-semibold">Help</span>
        </Link>
      </nav>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card-surface rounded-[16px] ${className}`}>{children}</section>;
}
