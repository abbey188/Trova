import { AppFrame } from "@/components/trova/frame";

/** Shown the instant an asset opens, while its tokens are rated and its history is read. */
export default function Loading() {
  const block = (h: number) => <div className="animate-pulse" style={{ height: h, borderRadius: 16, background: "var(--surface)", border: "1px solid var(--hairline)" }} />;
  return (
    <AppFrame active="markets">
      <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 14 }} aria-busy="true">
        <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>Rating every token for this company…</span>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_352px]">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{block(60)}{block(300)}{block(120)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{block(260)}{block(180)}</div>
        </div>
      </div>
    </AppFrame>
  );
}
