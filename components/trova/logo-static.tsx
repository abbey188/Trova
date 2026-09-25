import { brandFor, initialsFor } from "@/lib/brand";

/** Server-rendered company logo: the clean logo when there is one, else the canvas's brand disc. */
export function CompanyLogoStatic({ src, name, id, size = 38 }: { src?: string | null; name: string; id?: string; size?: number }) {
  const shape = { width: size, height: size, borderRadius: 999, flexShrink: 0 } as const;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} style={{ ...shape, objectFit: "cover", background: "var(--surface)", boxShadow: "inset 0 0 0 1px var(--hairline)", outline: "1px solid var(--hairline)", outlineOffset: -1, display: "block" }} />;
  }
  return (
    <span aria-hidden="true" style={{ ...shape, fontFamily: "var(--font-display), system-ui", display: "flex", alignItems: "center", justifyContent: "center", background: brandFor(id ?? name), color: "#fff", fontSize: Math.round(size * 0.38), fontWeight: 700 }}>
      {initialsFor(name)}
    </span>
  );
}
