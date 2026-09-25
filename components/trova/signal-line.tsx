// A change, said the way the canvas says it: "TSLAon stopped being tradable", "METAx moved up to
// Tier 2", the key change in bold. Red appears only for "you can't get out". Shared by Home,
// Updates and the asset page so a change reads the same everywhere.

import type { ReactNode } from "react";

import type { Signal } from "@/lib/types";

const RED = { color: "var(--danger)" } as const;
const tierN = (t?: string) => Number((t ?? "").replace(/\D/g, "")) || null;

export function signalTitle(s: Signal): ReactNode {
  const sym = s.symbol ?? "";
  switch (s.kind) {
    case "routability-change":
      return s.to === "not tradable" ? <>{sym} <b style={RED}>stopped being tradable</b></> : <>{sym} <b>is tradable again</b></>;
    case "tier-change": {
      const from = tierN(s.from);
      const to = tierN(s.to);
      const up = from != null && to != null && to < from; // Tier 1 is the deepest
      return <>{sym} moved {up ? "up" : "down"} to <b>{s.to}</b></>;
    }
    case "grade-change":
      return <>{sym} rating <b>{s.from} → {s.to}</b></>;
    case "exit-change":
      return <>{sym} exit score <b>{s.from} → {s.to}</b></>;
    case "redemption-change":
      return <>{sym} redemption is now <b>{s.to}</b></>;
    case "ownership-change":
      return <>{sym} is now <b>{s.to}</b></>;
    case "advisory":
      return s.to === "none" ? <>{sym} warning <b>lifted</b></> : <>{sym} <b style={RED}>warning: {s.to}</b></>;
    case "new-variant":
      return <>{sym} is <b>newly tokenized</b></>;
    default:
      return s.message;
  }
}

export function signalMeta(s: Signal): string {
  const days = s.detectedAt ? Math.floor((Date.now() - s.detectedAt) / 86_400_000) : null;
  const when = days == null ? "" : days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  const held = s.kind === "grade-change" || s.kind === "routability-change" || s.kind === "exit-change" ? " · held 3 snapshots" : "";
  return `${when}${held}`;
}

/** Change events only — portfolio-level notes (concentration, speculative share) are not activity. */
export const isChange = (s: Signal) => s.detectedAt != null && !!s.symbol;
