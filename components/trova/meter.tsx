const TONE = (value: number) =>
  value >= 80 ? "var(--grade-a)" : value >= 65 ? "var(--grade-b)" : value >= 50 ? "var(--grade-c)" : "var(--grade-d)";

/** A 0–100 bar. `tone` can be forced when the colour should not follow the value. */
export function Meter({ value, tone, height = 6 }: { value: number; tone?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ background: "var(--track)", height }}>
      <div
        className="rounded-full"
        style={{ width: `${Math.max(1.5, Math.min(100, value))}%`, height, background: tone ?? TONE(value) }}
      />
    </div>
  );
}

/**
 * The two pillars, in plain language with the method's own term beside it.
 * "What you own" = Structure · "Can you get out" = Market health.
 */
export function PillarMeter({
  plain,
  term,
  value,
  detail,
}: {
  plain: string;
  term: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold">{plain}</span>
        <span className="eyebrow">{term}</span>
        <span className="font-display tabular ml-auto text-[13px] font-semibold">{value}</span>
      </div>
      <Meter value={value} />
      {detail && (
        <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
          {detail}
        </span>
      )}
    </div>
  );
}
