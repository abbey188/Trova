import { unstable_cache } from "next/cache";
import Link from "next/link";

import { ConnectedRedirect } from "@/components/trova/connected-redirect";
import { GradeBadge } from "@/components/trova/grade-badge";
import { SearchBox } from "@/components/trova/search";
import { ConnectButton } from "@/components/trova/wallet";
import { buildAssetDetail } from "@/lib/asset";
import { count, usd } from "@/lib/format";
import { exitCost } from "@/lib/jupiter";
import type { AssetVariantView } from "@/lib/types";

// Live, but not per request: Tesla's two tokens re-measured every five minutes.
export const revalidate = 300;

// Cached across visitors for five minutes, so the landing page never waits on four live quotes.
const teslaRightNow = unstable_cache(async () => {
  try {
    const d = await buildAssetDetail("tesla");
    const good = d?.variants.find((v) => v.symbol === "TSLAx");
    const thin = d?.variants.find((v) => v.symbol === "TSLAon");
    if (!good || !thin) return null;
    const [goodTrip, thinTrip] = await Promise.all([exitCost(good.mint, 500), exitCost(thin.mint, 500)]);
    return { good, thin, goodTrip, thinTrip };
  } catch {
    return null; // the page still works without the live example
  }
}, ["landing-tesla"], { revalidate: 300 });

function TokenCard({ v, line, highlight }: { v: AssetVariantView; line: string; highlight: boolean }) {
  const s = v.score;
  return (
    <div
      className="flex flex-col gap-3 rounded-[18px] p-5"
      style={{ background: "var(--surface)", border: highlight ? "2px solid var(--grade-a)" : "1px solid var(--hairline)" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[17px] font-semibold">{v.symbol}</span>
          <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
            {v.issuer} · {usd(v.liquidityUsd, { compact: true })} liquidity · {count(v.holders)} holders
          </span>
        </div>
        <span className="ml-auto"><GradeBadge grade={s.grade} score={s.score} size="lg" /></span>
      </div>
      {(["ownership", "exit"] as const).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <div className="flex text-[12px]"><span className="font-semibold capitalize">{k}</span><span className="tabular ml-auto font-bold">{s[k].score}</span></div>
          <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--canvas)" }}>
            <div className="h-full rounded-full" style={{ width: `${s[k].score}%`, background: s[k].score >= 65 ? "var(--grade-a)" : s[k].score >= 50 ? "var(--grade-c)" : "var(--danger)" }} />
          </div>
        </div>
      ))}
      <span className="text-[13px] font-semibold" style={{ color: highlight ? "var(--grade-a)" : "var(--danger)" }}>{line}</span>
    </div>
  );
}

export default async function Landing() {
  const tesla = await teslaRightNow();
  const trip = (t: Awaited<ReturnType<typeof exitCost>>) =>
    t.status === "ok" && t.roundTripPct != null ? 500 * (1 - t.roundTripPct / 100) : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--canvas)" }}>
      <ConnectedRedirect />
      <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px]" style={{ background: "var(--action)" }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--action-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
          </span>
          <span className="font-display text-[22px] font-bold tracking-tight">Trova</span>
          <nav className="ml-auto flex items-center gap-4 text-[13px] font-semibold">
            <Link href="/markets" style={{ color: "var(--ink-soft)" }}>Markets</Link>
            <Link href="/help" style={{ color: "var(--ink-soft)" }}>How ratings work</Link>
          </nav>
        </header>

        <div className="grid items-center gap-10 lg:grid-cols-[1fr_520px]">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-[44px] font-bold leading-[1.02] tracking-tight md:text-[60px]">
              Credit ratings for<br />tokenized stocks.
            </h1>
            <p className="max-w-[48ch] text-[16px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              The same stock exists as several tokens on Solana. We rate every one on what you actually own and
              whether you can get back out — rechecked daily, with an alert when it changes.
            </p>
            <div className="flex max-w-[420px] flex-col gap-3">
              <ConnectButton size="lg" />
              <SearchBox />
              <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-faint)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                We only read your public address. You sign nothing to look.
              </span>
            </div>
          </div>

          {tesla && (
            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-semibold" style={{ color: "var(--ink-faint)" }}>Tesla, right now</span>
              <TokenCard
                v={tesla.good}
                highlight
                line={trip(tesla.goodTrip) != null ? `Buy $500 and sell it straight back: ${usd(trip(tesla.goodTrip))} returns.` : tesla.good.explanation?.headline ?? ""}
              />
              <TokenCard
                v={tesla.thin}
                highlight={false}
                line={trip(tesla.thinTrip) != null ? `Buy $500 and sell it straight back: ${usd(trip(tesla.thinTrip))} returns.` : tesla.thin.explanation?.headline ?? ""}
              />
              <span className="text-[12px]" style={{ color: "var(--ink-faint)" }}>Same company. Same chart. Quoted through Jupiter in the last five minutes.</span>
              <Link href="/asset/tesla" className="text-[13px] font-semibold">See why →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
