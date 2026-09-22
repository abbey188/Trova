import { notFound } from "next/navigation";

import { Chip } from "@/components/trova/chips";
import { ReferenceCard } from "@/components/trova/reference-card";
import { Card, Shell } from "@/components/trova/shell";
import { VariantCard } from "@/components/trova/variant-card";
import { buildAssetDetail } from "@/lib/asset";
import { count, usd } from "@/lib/format";

export const revalidate = 30;

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = decodeURIComponent(id);
  const detail = await buildAssetDetail(assetId);
  if (!detail) notFound();

  const { asset, variants, best, reference, stats, privateMark, signals, historyDays, warnings } = detail;
  const tradable = variants.filter((v) => v.score.routable).length;
  const runnerUpSymbol = best?.closeCall
    ? variants.find((v) => v.mint === best.runnerUpMint)?.symbol ?? null
    : null;

  return (
    <Shell
      title={asset.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{asset.symbol}</span>
          <span>·</span>
          <span>
            {variants.length} token{variants.length === 1 ? "" : "s"} on Solana, {tradable} tradable
          </span>
          <span>·</span>
          <span>Method {detail.methodVersion}</span>
        </span>
      }
      actions={
        best ? (
          <span
            className="rounded-[10px] px-4 py-2.5 text-[13px] font-bold"
            style={{ background: "var(--action)", color: "var(--action-ink)" }}
          >
            Buy {best.symbol}
          </span>
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[15px] font-semibold">Which token to hold</h2>
            <p className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
              Same company, different issuers. Ranked on what you&apos;d own and whether you could get back out.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {variants.map((variant) => (
              <VariantCard
                key={variant.mint}
                assetId={assetId}
                variant={variant}
                referenceTicker={reference?.ticker}
                closeCallWith={best?.closeCall && best.mint === variant.mint ? runnerUpSymbol : null}
              />
            ))}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <ReferenceCard reference={reference} />

          {privateMark && (
            <Card className="flex flex-col gap-2 p-5">
              <span className="eyebrow">Private company</span>
              <div className="flex flex-col gap-1 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span style={{ color: "var(--ink-soft)" }}>Last private mark</span>
                  <span className="font-display tabular font-semibold">
                    {usd(privateMark.markValuationUsd / 1e9, { compact: false }).replace("$", "$")}B
                  </span>
                </div>
                {privateMark.impliedValuationUsd != null && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ color: "var(--ink-soft)" }}>This token implies</span>
                    <span className="font-display tabular font-semibold">
                      {usd(privateMark.impliedValuationUsd / 1e9).replace("$", "$")}B
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                There is no public market here. The price moves against a private valuation, not a listed share.
              </p>
            </Card>
          )}

          {stats && (
            <Card className="flex flex-col gap-3 p-5">
              <span className="eyebrow">Across all tokens</span>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Liquidity" value={usd(stats.liquidityUsd, { compact: true })} />
                <Stat label="24h volume" value={usd(stats.volume24hUsd, { compact: true })} />
                <Stat label="30d volume" value={usd(stats.volume30dUsd, { compact: true })} />
                <Stat label="Holders" value={count(stats.holders)} />
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">What changed</span>
              <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                {historyDays} day{historyDays === 1 ? "" : "s"} tracked
              </span>
            </div>
            {signals.length === 0 ? (
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                Nothing has moved for these tokens. A rating only changes after the shift holds for three daily
                snapshots, so noise never becomes an alert.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {signals.slice(0, 5).map((signal, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          signal.severity === "danger"
                            ? "var(--danger)"
                            : signal.severity === "warn"
                              ? "var(--grade-c)"
                              : "var(--grade-a)",
                      }}
                    />
                    <span className="text-[12px] leading-snug" style={{ color: "var(--ink-soft)" }}>
                      {signal.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {warnings.length > 0 && (
            <Card className="flex flex-col gap-2 p-5">
              <span className="eyebrow">Partial data</span>
              {warnings.slice(0, 3).map((warning, i) => (
                <span key={i} className="text-[11px] leading-snug" style={{ color: "var(--ink-faint)" }}>
                  {warning}
                </span>
              ))}
            </Card>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      <span className="font-display tabular text-[15px] font-semibold">{value}</span>
    </div>
  );
}
