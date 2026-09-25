// /docs — the full method, for anyone who wants more than the "How ratings work" panel.
// Server-rendered; the worked examples are live (TSLAx, TSLAon, OpenAI), refreshed hourly.

import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { ReactNode } from "react";

import { AppFrame } from "@/components/trova/frame";
import { CompanyLogo, GradePill, WhyButton } from "@/components/trova/kit";
import { buildAssetDetail } from "@/lib/asset";
import type { AssetVariantView, Rating } from "@/lib/types";

export const revalidate = 3600;
export const metadata = { title: "Method · Trova", description: "How Trova rates a tokenized stock: what you own, and whether you can get out." };

// Server component: the kit's client values (DISPLAY, NUM, Icon) can't be spread here, so restated.
const DISPLAY = { fontFamily: "var(--font-display), system-ui" } as const;
const NUM = { ...DISPLAY, fontVariantNumeric: "tabular-nums" } as const;
const PANEL = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 18 } as const;

const gradeOf = (s: number): Rating => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : "D");
const fill = (g: Rating) => `var(--grade-${g.toLowerCase()})`;
const tint = (g: Rating) => `var(--grade-${g.toLowerCase()}-bg)`;
const usd = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : n >= 1e3 ? `$${n / 1e3}k` : `$${n}`);
const cnt = (n: number) => (n >= 1e3 ? `${n / 1e3}k` : `${n}`);

const SECTIONS: [string, string][] = [
  ["problem", "The problem"],
  ["questions", "Two questions"],
  ["ownership", "Ownership"],
  ["exit", "Exit"],
  ["combined", "The combined score"],
  ["grades", "Grades and confidence"],
  ["classes", "Instrument classes"],
  ["never", "What never moves a rating"],
  ["leave", "Cost to leave"],
  ["change", "Change over time"],
  ["examples", "Worked examples"],
  ["sources", "Sources and limits"],
];

function H2({ id, children, n }: { id: string; children: ReactNode; n: number }) {
  return (
    <h2 id={id} style={{ ...DISPLAY, margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, scrollMarginTop: 24, display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ ...NUM, fontSize: 13, color: "var(--ink-faint)" }}>{String(n).padStart(2, "0")}</span>{children}
    </h2>
  );
}
const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--ink-soft)", maxWidth: "70ch" }}>{children}</p>;

function Table({ head, rows, num = [] }: { head: string[]; rows: ReactNode[][]; num?: number[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--hairline)", borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 460 }}>
        <thead>
          <tr style={{ background: "var(--canvas)" }}>
            {head.map((h, i) => <th key={h} style={{ textAlign: num.includes(i) ? "right" : "left", padding: "10px 14px", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--track)" }}>
              {r.map((c, j) => <td key={j} style={{ padding: "11px 14px", verticalAlign: "top", textAlign: num.includes(j) ? "right" : "left", ...(num.includes(j) ? NUM : {}), lineHeight: 1.5 }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where √(Ownership × Exit) lands, over the whole square — with real tokens placed on it. */
function ScoreMap({ points }: { points: { label: string; o: number; e: number }[] }) {
  const N = 20;
  const S = 300;
  const c = S / N;
  const cells: ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const o = (i + 0.5) * (100 / N);
      const e = (j + 0.5) * (100 / N);
      const g = gradeOf(Math.sqrt(o * e));
      cells.push(<rect key={`${i}-${j}`} x={j * c} y={S - (i + 1) * c} width={c + 0.5} height={c + 0.5} fill={tint(g)} />);
    }
  }
  return (
    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ position: "relative", width: S + 34, flexShrink: 0 }}>
        <svg width={S + 34} height={S + 40} viewBox={`-34 -10 ${S + 34} ${S + 40}`} role="img" aria-label="Grade for every combination of Ownership and Exit" style={{ display: "block", maxWidth: "100%" }}>
          {cells}
          {[50, 65, 80].map((t) => {
            // the contour √(o·e) = t, i.e. o = t²/e
            const pts: string[] = [];
            for (let e = t * t / 100; e <= 100; e += 0.5) pts.push(`${(e / 100) * S},${S - ((t * t) / e / 100) * S}`);
            return <polyline key={t} points={pts.join(" ")} fill="none" stroke={fill(gradeOf(t))} strokeWidth="1.5" />;
          })}
          {points.map((p) => (
            <g key={p.label}>
              <circle cx={(p.e / 100) * S} cy={S - (p.o / 100) * S} r="6" fill="var(--ink)" stroke="var(--surface)" strokeWidth="2" />
              <text x={(p.e / 100) * S + (p.e > 70 ? -10 : 10)} y={S - (p.o / 100) * S + 4} textAnchor={p.e > 70 ? "end" : "start"} fontSize="11" fontWeight="700" fill="var(--ink)" style={DISPLAY}>{p.label}</text>
            </g>
          ))}
          {[0, 50, 100].map((v) => <text key={`x${v}`} x={(v / 100) * S} y={S + 16} fontSize="10" fill="var(--ink-faint)" textAnchor={v === 0 ? "start" : v === 100 ? "end" : "middle"}>{v}</text>)}
          {[0, 50, 100].map((v) => <text key={`y${v}`} x={-8} y={S - (v / 100) * S + 4} fontSize="10" fill="var(--ink-faint)" textAnchor="end">{v}</text>)}
          <text x={S / 2} y={S + 29} fontSize="10" fontWeight="700" fill="var(--ink-soft)" textAnchor="middle">EXIT →</text>
        </svg>
        <span style={{ position: "absolute", left: -2, top: S / 2 - 30, transform: "rotate(-90deg)", transformOrigin: "left top", fontSize: 10, fontWeight: 700, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>OWNERSHIP →</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
        <P>Each square is the grade a token would get with that Ownership and Exit. The curves are the grade lines. Because the halves multiply, a token needs <b style={{ color: "var(--ink)" }}>both</b> to reach A — strength on one side cannot buy it.</P>
        <P>The dots are real tokens, live: a sound Tesla token, a thin one with the same paperwork, and an OpenAI exposure token whose market is deep but whose ownership is almost nothing.</P>
      </div>
    </div>
  );
}

// The live examples are the slow part (two full asset builds); keep them for an hour.
const examplesData = unstable_cache(
  async () => Promise.all([buildAssetDetail("tesla").catch(() => null), buildAssetDetail("openai").catch(() => null)]),
  ["docs-examples-v1"],
  { revalidate: 3600 },
);

export default async function DocsPage() {
  const [tesla, openai] = await examplesData();
  const pick = (d: typeof tesla, sym: string) => d?.variants.find((v) => v.symbol === sym) ?? null;
  const examples = [
    { v: pick(tesla, "TSLAx"), assetId: "tesla", name: "Tesla", logo: tesla?.asset.logoUrl ?? null },
    { v: pick(tesla, "TSLAon"), assetId: "tesla", name: "Tesla", logo: tesla?.asset.logoUrl ?? null },
    { v: openai?.variants.find((x) => x.mint === openai.best?.mint) ?? openai?.variants[0] ?? null, assetId: "openai", name: "OpenAI", logo: openai?.asset.logoUrl ?? null },
  ].filter((x): x is { v: AssetVariantView; assetId: string; name: string; logo: string | null } => !!x.v);
  const points = examples.map((x) => ({ label: x.v.symbol, o: x.v.score.ownership.score, e: x.v.score.exit.score }));

  return (
    <AppFrame active="none">
      <main style={{ padding: "34px clamp(16px, 4vw, 48px) 60px", display: "flex", gap: 40, alignItems: "flex-start" }}>
        <nav aria-label="On this page" className="hidden xl:flex" style={{ position: "sticky", top: 28, width: 200, flexShrink: 0, flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700, marginBottom: 8 }}>On this page</span>
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} style={{ fontSize: 13, color: "var(--ink-soft)", textDecoration: "none", padding: "5px 0" }}>{label}</a>)}
        </nav>

        <article style={{ flexGrow: 1, minWidth: 0, maxWidth: 860, display: "flex", flexDirection: "column", gap: 38 }}>
          <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--ink-faint)", fontWeight: 700 }}>The method · v3.2</span>
            <h1 style={{ ...DISPLAY, margin: 0, fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>How Trova rates a tokenized stock</h1>
            <P>Trova rates every tokenized stock on Solana on two things: <b style={{ color: "var(--ink)" }}>Ownership</b>, what you&apos;d actually own, and <b style={{ color: "var(--ink)" }}>Exit</b>, whether you can get back out. Together they make the Trova Score. Every rating shows its working, and every rating updates as information becomes public.</P>
          </header>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="problem" n={1}>The problem</H2>
            <P>The same stock exists on Solana as several different tokens, from different issuers. On a price chart they look identical. What you get differs: some redeem for the real share, some pay its cash value, some give economic exposure with no rights at all, and some cannot be sold at any real size.</P>
            <P>This has hurt holders before. FTX sold stock tokens its site said could be redeemed for the underlying, while its terms said buyers had no claim to it; when FTX collapsed in 2022, holders were stuck. In 2025, OpenAI publicly warned that tokens sold under its name were not OpenAI equity.</P>
            <P>Market-only scores miss this. tokens.xyz&apos;s own market score gives Tesla, SpaceX and OpenAI tokens the same <b style={{ color: "var(--ink)" }}>A 100 · “Established”</b> — all four of its inputs are market metrics. Trova shows it beside ours, never blended in, and adds the half it leaves out.</P>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="questions" n={2}>Two questions</H2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {[["Ownership", "What do you own?", "Can you swap the token for the real share, and what does holding it entitle you to?"], ["Exit", "Can you get out?", "Is there a real market to sell into — deep, active, widely held, with clean fills?"]].map(([t, q, d]) => (
                <div key={t} style={{ ...PANEL, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ ...DISPLAY, fontSize: 19, fontWeight: 700 }}>{t}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{q}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)" }}>{d}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="ownership" n={3}>Ownership</H2>
            <P>Seventy percent is the redemption right the issuer reports; thirty percent is what the token entitles you to.</P>
            <Table head={["Redemption (70%)", "Score"]} num={[1]} rows={[
              ["Redeems for the share itself", 100],
              ["Redeems for the share's cash value", 75],
              ["Not reported — and no peers of its class report", 50],
              ["Not redeemable", 30],
            ]} />
            <Table head={["What it entitles you to (30%)", "Score"]} num={[1]} rows={[
              ["Full economic exposure to one share", 100],
              ["Daily-reset leveraged product", 40],
              ["Pre-IPO / SPV exposure — the issuer states no ownership, voting, dividend or information rights", 0],
            ]} />
            <P>Silence never beats an explicit answer: when a token doesn&apos;t report redemption, it takes the most conservative value its peers report. Every pre-IPO token that reports says <i>not redeemable</i>, so an unreported one is scored the same.</P>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="exit" n={4}>Exit</H2>
            <P>The mean of four measures — market depth, activity (trades and volume), holders, and fill quality where tokens.xyz reports it. Each is scored against fixed anchors taken from the tradable tokens on Solana, so <b style={{ color: "var(--ink)" }}>50 means “the median tradable token”</b>. Fixed, not recomputed live, so a token&apos;s score only moves when the token changes.</P>
            <Table head={["Score", "Depth", "Holders", "Trades · 24h", "Volume · 24h"]} num={[0, 1, 2, 3, 4]} rows={[
              [0, usd(10_000), 10, 1, usd(100)],
              [25, usd(140_000), 400, 40, usd(5_000)],
              [50, usd(300_000), cnt(2_000), cnt(2_500), usd(150_000)],
              [75, usd(900_000), cnt(9_000), cnt(12_500), usd(1_200_000)],
              [90, usd(2_000_000), cnt(25_000), cnt(32_000), usd(2_500_000)],
              [100, usd(10_000_000), cnt(100_000), cnt(150_000), usd(25_000_000)],
            ]} />
            <P>Values in between are interpolated. Fill quality is tokens.xyz&apos;s execution score, 0–100, used as reported.</P>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <H2 id="combined" n={5}>The combined score</H2>
            <div style={{ ...PANEL, padding: "18px 22px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <span style={{ ...NUM, fontSize: 26, fontWeight: 700 }}>Trova Score = √( Ownership × Exit )</span>
              <span style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: "46ch" }}>Multiplied, not averaged. A busy market can&apos;t hide that you own nothing, and perfect paperwork can&apos;t hide a dead market.</span>
            </div>
            <ScoreMap points={points} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="grades" n={6}>Grades and confidence</H2>
            <div style={{ display: "grid", gridTemplateColumns: "50fr 15fr 15fr 20fr", gap: 3, ...NUM, fontSize: 13, fontWeight: 700, textAlign: "center" }}>
              {(["D", "C", "B", "A"] as Rating[]).map((g, i) => <div key={g} style={{ background: tint(g), color: fill(g), padding: "10px 0", borderRadius: i === 0 ? "10px 0 0 10px" : i === 3 ? "0 10px 10px 0" : 0 }}>{g}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "50fr 15fr 15fr 20fr", ...NUM, fontSize: 11, color: "var(--ink-faint)" }}><span>0</span><span>50</span><span>65</span><span>80</span></div>
            <Table head={["Rule", "What it means"]} rows={[
              ["A letter never stands alone", "Every grade is shown with its number — A 87, never just A."],
              ["Borderline", "Within 3 points of a cutoff, the rating says so and names the grade next to it."],
              ["Confidence", "High, medium or low: how many key inputs are reported — redemption, issuer, fill quality, holders, recent trades. Missing information lowers confidence; it never quietly improves a rating."],
              ["Not rated (NR)", "Redemption unreported, no trades, and at most one key input reported — too little to rate honestly."],
            ]} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="classes" n={7}>Instrument classes</H2>
            <P>Before scoring, each token is classified. No class is capped — the grade comes from the rubric, so a token whose structure improves scores higher.</P>
            <Table head={["Class", "What it is", "Entitlement"]} num={[2]} rows={[
              [<b key="1">Direct share</b>, "Redeemable for the share itself", 100],
              [<b key="2">Backed tracker</b>, "Redeemable for the share's cash value", 100],
              [<b key="3">Non-redeemable, listed</b>, "Tracks a listed company, no redemption", 100],
              [<b key="4">Unreported</b>, "No redemption path reported (funds, commodities…)", 100],
              [<b key="5">Leveraged</b>, "Daily-reset leveraged product", 40],
              [<span key="6"><b>Pre-IPO exposure</b> <span style={{ borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700, color: "var(--grade-c)", background: "var(--grade-c-bg)" }}>Speculative</span></span>, "SPV exposure to a private company; always labelled Speculative, everywhere", 0],
            ]} />
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="never" n={8}>What never moves a rating</H2>
            <Table head={["Shown as a fact", "Why it isn't scored"]} rows={[
              ["Price and price change", "A rating is about what you own and whether you can leave — not where the price goes. A token that fell 40% is not worse-rated for it."],
              ["Gap to the real share", "Shown only where units match; useful context, not safety."],
              ["Liquidity tier (Tier 1/2/3)", "A neutral label for market depth — depth is already in Exit."],
              ["Bot / market-maker share of volume", "Shown so you can judge it; not a verdict on the token."],
            ]} />
            <P>The only caps are advisories from tokens.xyz: <b style={{ color: "var(--ink)" }}>caution</b> caps a token at 50, <b style={{ color: "var(--ink)" }}>compromised</b> at 15, and <b style={{ color: "var(--ink)" }}>blocked</b> hides it.</P>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="leave" n={9}>Cost to leave</H2>
            <P>“What it costs to leave” is measured, not modelled: Trova quotes buying the token with USDC through Jupiter and selling it straight back, at $5,000, $50,000 and $250,000. Before you buy, the trade sheet does the same at your size. A failed quote is shown as <i>unavailable</i> — never as “you can&apos;t get out”.</P>
            <P>A token is <b style={{ color: "var(--ink)" }}>tradable</b> when it has at least $50k of liquidity, traded in the last 24 hours, and carries no compromised or blocked advisory.</P>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="change" n={10}>Change over time</H2>
            <Table head={["Change", "When it reaches you"]} rows={[
              ["Advisory added or cleared · redemption terms · instrument class · liquidity tier", "The same day"],
              ["Grade · tradability · exit health", "Only after it holds for three daily snapshots — one quiet afternoon never becomes an alert"],
              ["A new version of the method", "Never as a grade change — history is re-scored instead"],
            ]} />
            <P>Every token is snapshotted daily with its raw inputs, so its history can be re-scored whenever the method changes.</P>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="examples" n={11}>Worked examples · live</H2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {examples.map(({ v, assetId, name, logo }) => (
                <div key={v.mint} style={{ ...PANEL, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CompanyLogo src={logo} name={name} id={assetId} size={34} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ ...DISPLAY, fontSize: 16, fontWeight: 700 }}>{v.symbol}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{v.issuer} · {v.score.instrument.label}</span>
                    </div>
                    <span style={{ flexGrow: 1 }} />
                    <GradePill grade={v.score.grade} score={v.score.score} />
                  </div>
                  <span style={{ ...NUM, fontSize: 13, fontWeight: 700 }}>√({v.score.ownership.score} × {v.score.exit.score}) = {v.score.score ?? "NR"}</span>
                  {v.explanation && <span style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-soft)" }}>{v.explanation.headline}</span>}
                  <span style={{ flexGrow: 1 }} />
                  <div><WhyButton href={`/asset/${assetId}/rating/${v.mint}`} grade={v.score.grade} score={v.score.score} /></div>
                </div>
              ))}
            </div>
            {examples.length === 0 && <P>Live examples are unavailable right now.</P>}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <H2 id="sources" n={12}>Sources and limits</H2>
            <Table head={["Source", "Used for"]} rows={[
              ["tokens.xyz", "Variants, redemption terms, fill quality, liquidity, holders, advisories — the foundation of every rating"],
              ["Jupiter", "Quotes, the measured cost to leave, and swap transactions"],
              ["Pyth · Backpack", "The real share's price, history and market hours — display only"],
              ["Helius RPC", "Reading wallets (including Token-2022 splits) and sending transactions"],
            ]} />
            <P>Trova rates what its sources report; where an issuer reports nothing, it says so and lowers confidence. Reading a portfolio never needs a signature, and Trova never holds a key.</P>
            <P><b style={{ color: "var(--ink)" }}>The Trova Score is not a credit rating, a guarantee of safety, or investment advice.</b></P>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/markets" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: "var(--action)", color: "var(--action-ink)", textDecoration: "none" }}>See every rating</Link>
              <Link href="/p/demo" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--ink)", textDecoration: "none" }}>Try the demo portfolio</Link>
            </div>
          </section>
        </article>
      </main>
    </AppFrame>
  );
}
