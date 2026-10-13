// /lenders — the collateral sheet. For a risk team deciding what to lend against a tokenized stock:
// what the holder can redeem, what the issuer can do on-chain, and how much actually leaves — in US
// market hours and outside them. Every figure is reported, read from the mint, or measured; the
// lender arithmetic is shown with its inequality and is never a recommendation.
//
// The section has its own pages: one per issuer group (/lenders/ondo, /lenders/xstocks, …) and one
// per token (/lenders/<mint>), both served by app/lenders/[slug]/page.tsx.

import { AppFrame } from "@/components/trova/frame";
import { LIQUIDATOR_MARGIN_PCT } from "@/lib/collateral";
import { cachedSheet } from "@/lib/collateral-cache";

import { DISPLAY, DOWNLOADS, Eyebrow, P, SegmentNav, SheetTable, Stats } from "./parts";

export const dynamic = "force-dynamic";
export const metadata = { title: "For lenders · Trova", description: "What each tokenized stock on Solana can absorb, measured: redemption, issuer controls and exit capacity by market session." };

const SHOWN = 80;

export default async function LendersPage() {
  const sheet = await cachedSheet().catch(() => null);
  const rows = sheet?.rows ?? [];

  return (
    <AppFrame active="none">
      <main style={{ padding: "34px clamp(16px, 4vw, 48px) 60px", display: "flex", flexDirection: "column", gap: 26, maxWidth: 1240 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Eyebrow>For lenders · the collateral sheet</Eyebrow>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>What each tokenized stock can absorb, measured</h1>
          <P>One row per token on Solana: what the holder can redeem, what the issuer can do to the token on-chain, and how much leaves for under 1% — quoted as a real round trip on the better of Jupiter&apos;s two routes, in US market hours and outside them. Pool depth is not on this page: most of these tokens are filled by market makers, and their pools say nothing about what can be sold.</P>
          {DOWNLOADS}
        </header>

        <SegmentNav active="all" />

        {!sheet ? <P>The collateral sheet is unavailable right now.</P> : (
          <>
            <Stats rows={rows} />

            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SheetTable rows={rows.slice(0, SHOWN)} />
              <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>
                Showing the {Math.min(SHOWN, rows.length)} tokens with the most in-hours capacity, of {sheet.tokens}. Each issuer&apos;s page lists all of its tokens, and the download has every token and every column. A dash means not yet measured in market hours. Open a token for its full file.
              </span>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ ...DISPLAY, margin: 0, fontSize: 20, fontWeight: 700 }}>How to read it</h2>
              <P><b style={{ color: "var(--ink)" }}>Leaves under 1%</b> is the largest size, from $5,000 up to $25,000,000, whose round trip — buy with USDC, sell straight back — was quoted at under 1%. It is a quote, not an executed trade, and a round trip overstates what selling once costs.</P>
              <P><b style={{ color: "var(--ink)" }}>Sellable inside a 5% bonus</b> is the largest measured size a liquidator could sell and still keep {LIQUIDATOR_MARGIN_PCT} point of a 5% liquidation bonus. A liquidation only happens if selling the collateral costs less than the bonus paid for doing it. Each token&apos;s file shows other bonus levels, and the real share&apos;s largest move across a market closure.</P>
              <P><b style={{ color: "var(--ink)" }}>Issuer can</b> is read from the token&apos;s mint account on Solana. Controls like these are usual for a regulated issuer; they are listed so a lender can see them, and none of them moves a rating.</P>
              <P>Measurements began on {new Date(sheet.measuredSince).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, so this is days of history, not months. What a token can absorb changes with the hour and the day; the sheet shows the latest stored measurement for each session. Nothing here is a recommendation, and a lender adds its own margin.</P>
            </section>
          </>
        )}
      </main>
    </AppFrame>
  );
}
