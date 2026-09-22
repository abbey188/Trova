import Link from "next/link";
import type { ReactNode } from "react";

function RailIcon({ href, active, label, children }: { href: string; active?: boolean; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors"
      style={active ? { background: "var(--ink)", color: "var(--surface)" } : { color: "var(--ink-faint)" }}
    >
      {children}
    </Link>
  );
}

/** The app frame: a rail, a header strip, and the page. */
export function Shell({
  title,
  subtitle,
  actions,
  active = "markets",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  active?: "portfolio" | "markets" | "changes";
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "var(--canvas)" }}>
      <div
        className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1440px] overflow-hidden rounded-[20px]"
        style={{ background: "var(--surface)", boxShadow: "0 10px 40px rgba(20,22,26,0.06)" }}
      >
        <nav
          className="hidden w-[68px] shrink-0 flex-col items-center gap-2.5 py-5 md:flex"
          style={{ borderRight: "1px solid var(--hairline)" }}
        >
          <Link href="/" aria-label="Trova" className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: "var(--action)" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--action-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 15l4-5 3 3 5-7" />
            </svg>
          </Link>
          <div className="h-3" />
          <RailIcon href="/" label="Portfolio" active={active === "portfolio"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M3 10h18" />
            </svg>
          </RailIcon>
          <RailIcon href="/" label="Markets" active={active === "markets"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3v18h18" />
              <path d="M7 15l4-5 3 3 5-7" />
            </svg>
          </RailIcon>
          <RailIcon href="/" label="Changes" active={active === "changes"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5l3 2" />
            </svg>
          </RailIcon>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="flex flex-wrap items-center gap-4 px-5 py-4 md:px-7 md:py-5"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="font-display truncate text-[19px] font-semibold">{title}</div>
              {subtitle && (
                <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  {subtitle}
                </div>
              )}
            </div>
            {actions && <div className="ml-auto flex items-center gap-2.5">{actions}</div>}
          </header>
          <main className="flex-1 px-5 py-5 md:px-7 md:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`card-surface rounded-[14px] ${className}`}>{children}</section>
  );
}
