// Display formatting. Kept separate so every screen renders numbers the same way.

export function usd(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  }
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function count(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

/** Signed percentage, e.g. "+0.01%" — for gaps against a reference price. */
export function signedPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function age(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

/** Plain-language label for a redemption tier, with the precise term kept for the detail view. */
export function redemptionLabel(tier: string | null | undefined): string {
  switch (tier) {
    case "share_redeemable": return "Swappable for the real share";
    case "cash_redeemable": return "Cash value only";
    case "not_redeemable": return "No redemption";
    default: return "Not reported";
  }
}

export function tierLabel(tier: string | null | undefined): string {
  return tier ? `Tier ${String(tier).replace("tier", "")}` : "—";
}
