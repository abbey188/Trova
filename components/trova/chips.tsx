import type { ReactNode } from "react";

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const styles = {
    neutral: { color: "var(--ink-soft)", background: "var(--track)", border: "1px solid transparent" },
    good: { color: "var(--grade-a)", background: "var(--grade-a-bg)", border: "1px solid transparent" },
    warn: { color: "var(--grade-c)", background: "var(--grade-c-bg)", border: "1px solid transparent" },
    danger: { color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger-line)" },
  }[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={styles}
    >
      {children}
    </span>
  );
}

/** Reserved for the loudest fact we have: this position cannot be left. */
export function NoExitBanner({ reason }: { reason: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
      style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-line)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
          You can&apos;t get out of this one
        </span>
        <span className="text-[12px] leading-snug" style={{ color: "var(--danger)" }}>
          {reason}
        </span>
      </div>
    </div>
  );
}

export function SpeculativeChip() {
  return <Chip tone="danger">Speculative</Chip>;
}
