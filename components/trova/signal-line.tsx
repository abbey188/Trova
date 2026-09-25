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

/** Why the change counts, in one or two sentences. Factual, never predictive. */
export function signalWhy(s: Signal): string {
  const held = "The change held for three daily snapshots before we called it.";
  switch (s.kind) {
    case "routability-change": {
      const reason = s.message.split(" — ").slice(1).join(" — ").trim();
      return s.to === "not tradable" ? `${reason ? reason.replace(/\.?$/, ". ") : ""}${held}` : `A buyer can get in and out through Trova again. ${held}`;
    }
    case "grade-change": return `${held.replace(".", ",")} so one quiet afternoon could not do this.`;
    case "tier-change": return "Tier is a plain label for how deep the market is — it never moves the rating by itself.";
    case "exit-change": return `How easily it can be bought and sold. ${held}`;
    case "new-variant": return "First seen in a daily snapshot. We rate a token the day it appears, so a new one never sits unscored.";
    default: return s.message;
  }
}
