import { Shell } from "@/components/trova/shell";

/** Shown the instant an asset is opened, while its tokens are rated and its history is read. */
export default function Loading() {
  return (
    <Shell title="Loading…" active="markets">
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>Rating every token for this company…</span>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="card-surface h-[340px] animate-pulse rounded-[16px]" />
          <div className="card-surface h-[340px] animate-pulse rounded-[16px]" />
        </div>
      </div>
    </Shell>
  );
}
