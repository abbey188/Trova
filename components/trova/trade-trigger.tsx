"use client";

import { useState } from "react";

import { TradeSheet, type SwapFrom, type TokenOption } from "@/components/trova/trade-sheet";

/** A button that opens the trade sheet. Lets server-rendered pages offer Buy / Move without state. */
export function TradeTrigger({
  label,
  assetName,
  options,
  defaultMint,
  from,
  variant = "primary",
}: {
  label: string;
  assetName: string;
  options: TokenOption[];
  defaultMint: string;
  from?: SwapFrom;
  variant?: "primary" | "secondary" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const style =
    variant === "primary" ? { background: "var(--action)", color: "var(--action-ink)" }
    : variant === "secondary" ? { border: "1px solid var(--hairline)", color: "var(--ink)", background: "var(--surface)" }
    : { background: "var(--action)", color: "var(--action-ink)" };
  const size = variant === "inline" ? "h-8 rounded-[9px] px-3 text-[12px]" : "h-10 rounded-[11px] px-5 text-[13px]";
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={`${size} inline-flex items-center font-bold`}
        style={style}
      >
        {label}
      </button>
      <TradeSheet open={open} onClose={() => setOpen(false)} assetName={assetName} options={options} defaultMint={defaultMint} from={from} />
    </>
  );
}
