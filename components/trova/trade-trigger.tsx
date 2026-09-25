"use client";

import { useState } from "react";

import { TradeSheet, type SwapFrom, type TokenOption } from "@/components/trova/trade-sheet";

/** A button that opens the trade sheet. Lets server-rendered pages offer Buy / Move without state. */
export function TradeTrigger({
  label,
  assetName,
  assetId,
  logoUrl,
  options,
  defaultMint,
  from,
  variant = "primary",
}: {
  label: string;
  assetName: string;
  assetId?: string;
  logoUrl?: string | null;
  options: TokenOption[];
  defaultMint: string;
  from?: SwapFrom;
  variant?: "primary" | "secondary" | "inline" | "block";
}) {
  const [open, setOpen] = useState(false);
  // The canvas's buttons: lime is the one action colour; secondary is a hairline outline.
  const style =
    variant === "secondary" ? { border: "1px solid var(--hairline)", color: "var(--ink)", background: "var(--surface)", fontWeight: 600 }
    : { background: "var(--action)", color: "var(--action-ink)", fontWeight: 700 };
  const size =
    variant === "inline" ? "h-8 rounded-[9px] px-3 text-[12px]"
    : variant === "block" ? "h-[54px] w-full rounded-[15px] px-5 text-[16px]"
    : variant === "secondary" ? "h-10 rounded-[11px] px-[18px] text-[13px]"
    : "h-10 rounded-[11px] px-6 text-[13px]";
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={`${size} inline-flex items-center justify-center whitespace-nowrap`}
        style={style}
      >
        {label}
      </button>
      {/* Keep the sheet's clicks from reaching a tappable card or row it was opened from. */}
      <span onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
      <TradeSheet open={open} onClose={() => setOpen(false)} assetName={assetName} assetId={assetId} logoUrl={logoUrl} options={options} defaultMint={defaultMint} from={from} />
      </span>
    </>
  );
}
