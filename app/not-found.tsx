import Link from "next/link";

import { AppFrame } from "@/components/trova/frame";

export const metadata = { title: "Not found · Trova" };

// Anything we can't find — an unknown company, a token that isn't one of its variants, a mistyped
// link — lands here, inside the app, with a way back.
export default function NotFound() {
  return (
    <AppFrame active="none">
      <main style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 18px" }}>
        <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-display), system-ui", fontSize: 44, fontWeight: 700, color: "var(--ink-faint)" }}>404</span>
          <h1 style={{ fontFamily: "var(--font-display), system-ui", margin: 0, fontSize: 22, fontWeight: 700 }}>We couldn&apos;t find that</h1>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)" }}>
            It may not be tokenized on Solana yet, or the link is out of date. Every company we rate is in Markets.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Link href="/markets" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", textDecoration: "none" }}>Browse markets</Link>
            <Link href="/p/demo" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>Home</Link>
          </div>
        </div>
      </main>
    </AppFrame>
  );
}
