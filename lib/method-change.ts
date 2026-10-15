// Where a rating history crosses a change of method. Safe for client and server.
//
// Scores from different major versions of the method are not comparable: v3 read Exit from pool
// depth, v4 from a measured round trip, and on 13 Oct 2026 many tokens jumped from D to B without
// anything about the token changing. A chart that shows both must say where the line changes meaning.

import type { HistoryPoint } from "./types";

export const METHOD_NOTES: Record<string, string> = {
  v4: "Exit measured from real round trips; before this it read pool depth",
};

/** Index of the last point whose method differs from the point before it, or null when none does. */
export function methodChangeIndex(points: HistoryPoint[]): number | null {
  let at: number | null = null;
  for (let i = 1; i < points.length; i++) {
    if (points[i].method && points[i - 1].method && points[i].method !== points[i - 1].method) at = i;
  }
  return at;
}

/** One sentence for under a chart that crosses a change of method, or null. */
export function methodChangeNote(points: HistoryPoint[]): string | null {
  const i = methodChangeIndex(points);
  if (i == null) return null;
  const day = new Date(`${points[i].date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const what = METHOD_NOTES[points[i].method ?? ""] ?? "the method changed";
  return `From ${day}: ${what}. A move at that line is the method changing, not the token.`;
}
