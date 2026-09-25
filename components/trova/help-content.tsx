"use client";

// "How ratings work" — the ? panel (flow map: a panel, never a page). Ported from HelpDesktop.

import { useState } from "react";

import { DISPLAY, Icon, NUM } from "@/components/trova/kit";

const FAQ: { q: string; a: string }[] = [
  { q: "Does the price affect the rating?", a: "No. Price, price changes and the gap to the real market are shown as facts and never enter the score. A token that has fallen 40% is not worse-rated for it; a token that cannot be sold is." },
  { q: "Why is a huge company rated D?", a: "Because the rating is of the token, not the company. A token that can't be redeemed for anything, or that nobody trades, is rated on that — however large the company behind it." },
  { q: "What does “Speculative” mean?", a: "Exposure to a private company through an SPV. The issuers state these tokens confer no ownership, voting, dividend or information rights and may result in total loss. They are labelled wherever they appear." },
  { q: "How often do ratings change?", a: "Every token is re-rated every day. A grade or tradability change has to hold for three daily checks before it reaches you; a change to what you own shows the same day." },
  { q: "Do you hold my tokens?", a: "No. Looking uses only your public address — you sign nothing to look. A trade is built by us and signed and sent by your own wallet. Trova never holds a key." },
  { q: "What can't you tell me?", a: "Whether a price will go up. Ratings describe what a token is and whether you can get out of it today — never where it is heading." },
  { q: "Can I trust the numbers?", a: "Token data comes from tokens.xyz, trade quotes from Jupiter, real stock prices from Pyth and Backpack, balances from the chain. Costs to leave are measured by quoting the trade, not estimated. tokens.xyz's own rating sits beside ours on every asset page." },
];

export function HelpContent({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ padding: "26px clamp(18px, 3vw, 34px) 30px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>How ratings work</span>
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Two questions we ask of every token on Solana — and nothing else</span>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 12, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}>{Icon.close()}</button>
        )}
      </div>

      {/* Wide: the method on the left, the questions on the right. Narrow: one column. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 24, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <section style={{ background: "var(--canvas)", borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 700 }}>Ownership</span>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>Can you swap the token for the real share, and what does holding it actually entitle you to?</p>
          {[[70, "the redemption right"], [30, "what it entitles you to"]].map(([w, label]) => (
            <div key={label as string} style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface)", overflow: "hidden" }}><div style={{ width: `${w}%`, height: 6, background: "var(--grade-b)" }} /></div>
              <span style={{ fontSize: 11, color: "var(--ink-soft)" }}><b style={{ ...NUM, color: "var(--ink)" }}>{w}%</b> {label}</span>
            </div>
          ))}
        </section>
        <section style={{ background: "var(--canvas)", borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...DISPLAY, fontSize: 17, fontWeight: 700 }}>Exit</span>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>Is there enough of a market to sell into, at the size you actually hold?</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {["depth of the market", "how much it trades", "how many hold it", "quality of the fills"].map((c) => (
              <span key={c} style={{ borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "var(--surface)", color: "var(--ink)" }}>{c}</span>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 2px" }}>
        <span style={{ ...NUM, fontSize: 18, fontWeight: 700 }}>√( Ownership × Exit )</span>
        <span style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-soft)" }}>The two halves are multiplied, not averaged, so neither can hide the other. Perfect paperwork with a dead market still fails — and a busy market with no rights fails too.</span>
      </div>

      <section style={{ border: "1px solid var(--hairline)", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>The scale</span>
          <span style={{ flexGrow: 1 }} />
          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>a letter is never shown without its number</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "50fr 15fr 15fr 20fr", gap: 3, ...NUM, fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          <div style={{ background: "var(--grade-d-bg)", color: "var(--grade-d)", borderRadius: "8px 0 0 8px", padding: "7px 0" }}>D</div>
          <div style={{ background: "var(--grade-c-bg)", color: "var(--grade-c)", padding: "7px 0" }}>C</div>
          <div style={{ background: "var(--grade-b-bg)", color: "var(--grade-b)", padding: "7px 0" }}>B</div>
          <div style={{ background: "var(--grade-a-bg)", color: "var(--grade-a)", borderRadius: "0 8px 8px 0", padding: "7px 0" }}>A</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "50fr 15fr 15fr 20fr", ...NUM, fontSize: 10, color: "var(--ink-faint)" }}>
          <span>0</span><span>50</span><span>65</span><span>80</span>
        </div>
      </section>

      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600, marginBottom: 6 }}>Common questions</span>
        {FAQ.map((f, i) => (
          <div key={f.q} style={{ borderTop: "1px solid var(--track)" }}>
            <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "12px 2px", border: "none", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
              {f.q}
              <span style={{ marginLeft: "auto", color: "var(--ink-faint)", transform: open === i ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>{Icon.chevronDown(13)}</span>
            </button>
            {open === i && <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.6, color: "var(--ink-soft)" }}>{f.a}</p>}
          </div>
        ))}
      </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a href="/docs" onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 16px", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "var(--grade-a)", background: "var(--grade-a-bg)", textDecoration: "none" }}>Read the full method {Icon.chevronRight(14)}</a>
        <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Rescored every day. Every rating updates as more information becomes public.</span>
      </div>
    </div>
  );
}
