// Brand colours for the disc drawn when a company has no clean logo — the design canvas's own
// choices. Shared by server and client components, so it lives outside any "use client" module.

const BRAND: Record<string, string> = {
  tesla: "#E82127", spacex: "#1B1F2A", nvidia: "#76B900", microsoft: "#0B6BCB", apple: "#3A3A3C",
  meta: "#0866FF", openai: "#10A37F", gold: "#C9A227", netflix: "#E50914", arm: "#0091BD",
  cleanspark: "#5C6068", amazon: "#FF9900", alphabet: "#4285F4", google: "#4285F4", coinbase: "#0052FF",
  palantir: "#101113", gamestop: "#E3000B", circle: "#3D7DF6", anthropic: "#C96442", silver: "#8A9099",
};

export function brandFor(key: string): string {
  const k = key.toLowerCase();
  for (const [name, color] of Object.entries(BRAND)) if (k.includes(name)) return color;
  return "#5C6068";
}

/** The disc's letters: the first letter, except gold, which the canvas draws as "Au". */
export function initialsFor(name: string): string {
  if (/^gold$/i.test(name.trim())) return "Au";
  return name.replace(/^the\s+/i, "").trim().slice(0, 1).toUpperCase();
}
