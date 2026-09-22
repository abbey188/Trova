import type { Rating } from "@/lib/types";

const TONE: Record<Rating, { fg: string; bg: string }> = {
  A: { fg: "var(--grade-a)", bg: "var(--grade-a-bg)" },
  B: { fg: "var(--grade-b)", bg: "var(--grade-b-bg)" },
  C: { fg: "var(--grade-c)", bg: "var(--grade-c-bg)" },
  D: { fg: "var(--grade-d)", bg: "var(--grade-d-bg)" },
  NR: { fg: "var(--grade-nr)", bg: "var(--grade-nr-bg)" },
};

/** A grade is never shown without its number — ~20% of letters sit near a cutoff. */
export function GradeBadge({
  grade,
  score,
  size = "md",
}: {
  grade: Rating;
  score: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const tone = TONE[grade];
  const scale =
    size === "lg" ? "text-base px-3 py-1.5" : size === "sm" ? "text-[11px] px-2 py-1" : "text-xs px-2.5 py-1";
  return (
    <span
      className={`font-display inline-flex items-center gap-1.5 rounded-full font-bold tabular ${scale}`}
      style={{ color: tone.fg, background: tone.bg }}
    >
      {grade}
      {score != null && <span>{score}</span>}
    </span>
  );
}

export function BorderlineNote({
  borderline,
}: {
  borderline: { cutoff: number; adjacentGrade: string } | null;
}) {
  if (!borderline) return null;
  return (
    <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
      close to {borderline.adjacentGrade}
    </span>
  );
}
