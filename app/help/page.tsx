import { Card, Shell } from "@/components/trova/shell";
import { GRADE_CUTOFFS } from "@/lib/trust-score";

const FAQ = [
  {
    q: "Does the price affect the rating?",
    a: "Never. Price and price gaps are shown as facts, but no rating moves because a token went up or down. A rating is about what you own and whether you can get out.",
  },
  {
    q: "What does “Speculative” mean?",
    a: "Economic exposure to a private company through an SPV. The issuers state these tokens confer no ownership, voting, dividend or information rights and may result in total loss. They carry the label everywhere they appear.",
  },
  {
    q: "Do you hold my tokens?",
    a: "No. Looking at a portfolio uses only your public address — you sign nothing to look. A trade is built by us, but signed and sent by your own wallet. Trova never holds a key.",
  },
  {
    q: "What does “cost to leave” measure?",
    a: "We quote buying the token with USDC through Jupiter and selling it straight back, at the size shown. It is measured at that moment, not estimated from a model.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Token data and a second, market-only rating from tokens.xyz; trade quotes from Jupiter; real stock prices from Pyth and Backpack; balances from the chain itself. tokens.xyz's own rating sits beside ours on every asset page, never blended into it.",
  },
  {
    q: "Why hasn't a rating changed today?",
    a: "Every token is re-rated daily, but a grade or tradability change must hold for three daily checks before it reaches you. Changes to what you own — redemption terms, a warning — show the same day.",
  },
];

export default function HelpPage() {
  return (
    <Shell title="How ratings work" subtitle="Two questions we ask of every token on Solana — and nothing else" active="help">
      <div className="flex max-w-[980px] flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <span className="font-display text-[18px] font-bold">Ownership</span>
            <span className="text-[13px] font-semibold">What would you actually own?</span>
            <Bar pct={70} label="Can you swap it for the real share?" note="Share 100 · cash value 75 · not reported: most conservative peer value · no redemption 30" />
            <Bar pct={30} label="What does the token entitle you to?" note="Full exposure 100 · leveraged 40 · SPV exposure with no rights 0" />
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <span className="font-display text-[18px] font-bold">Exit</span>
            <span className="text-[13px] font-semibold">Could you get back out?</span>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Equal parts: depth of the market, how much it actually trades, how many people hold it, and fill quality where it is reported. Each is scored against fixed anchors, where 50 is the typical tradable token.
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Under $50k of liquidity, or no trade in 24 hours, and we won&apos;t route a trade into it.
            </p>
          </Card>
        </div>

        <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <span className="font-display tabular text-[20px] font-bold">√(Ownership × Exit)</span>
          <p className="min-w-[240px] flex-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Multiplied, not averaged, so neither half can hide the other. Grades: A from {GRADE_CUTOFFS.A}, B from {GRADE_CUTOFFS.B}, C from {GRADE_CUTOFFS.C}, D below. A letter never appears without its number, because a token near a cutoff is closer to its neighbour than the letter suggests. The only thing that caps a rating outright is a warning from our sources.
          </p>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
          {FAQ.map((f) => (
            <Card key={f.q} className="flex flex-col gap-2 p-5">
              <span className="text-[14px] font-semibold">{f.q}</span>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>{f.a}</p>
            </Card>
          ))}
        </div>

        <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
          Ratings are factual assessments of structure and market, not advice or a forecast. Every rating updates as more information becomes public.
        </p>
      </div>
    </Shell>
  );
}

function Bar({ pct, label, note }: { pct: number; label: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold">{label}</span>
        <span className="tabular ml-auto text-[12px] font-bold">{pct}%</span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--grade-b)" }} />
      </div>
      <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>{note}</span>
    </div>
  );
}
