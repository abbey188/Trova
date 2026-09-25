// "About <company>" for every asset. Server-only. Display only — never scored.
//
// Three sources, in order:
//   1. issuer    — tokens.xyz's own description, when it has one (about half do)
//   2. wikipedia — the page summary, found by search and accepted only when its title really names
//                  this company (TQQQ searches land on "ProShares", the fund manager — rejected)
//   3. trova     — a factual line we write from what we already know: listed, ETF, metal or private,
//                  and how many tokens track it on Solana
// Wikipedia text is CC BY-SA, so the page credits and links it.

export interface About {
  text: string;
  source: "issuer" | "wikipedia" | "trova";
  url: string | null;
}

const UA = { "User-Agent": "Trova/1.0 (https://trovascore.vercel.app)" };
const WEEK = 7 * 86_400;
const MAX_CHARS = 420;
// Words that say nothing about WHICH company a page is — ignored when matching titles.
const GENERIC = new Set(["inc", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "holdings", "holding", "group", "the", "trust", "etf", "fund", "class", "a", "sa", "nv", "ag", "se", "and", "of"]);

const words = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !GENERIC.has(w));

/** The page must be about this name: every word of its title is in the query, and it covers half of it. */
function titleMatches(title: string, query: string): boolean {
  const t = words(title);
  const q = words(query);
  if (!t.length || !q.length) return false;
  const inQuery = t.every((w) => q.includes(w));
  const coverage = t.filter((w) => q.includes(w)).length / q.length;
  return inQuery && coverage >= 0.5;
}

/** First sentences of the extract, cut on a sentence end, at most MAX_CHARS. */
function trimExtract(s: string): string {
  const clean = s.replace(/\s+/g, " ").replace(/ \([^)]*\)/g, "").trim();
  if (clean.length <= MAX_CHARS) return clean;
  const cut = clean.slice(0, MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".”"));
  return end > 120 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

async function fromWikipedia(query: string): Promise<About | null> {
  try {
    const u = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "1", format: "json" })}`;
    const search = (await (await fetch(u, { headers: UA, next: { revalidate: WEEK }, signal: AbortSignal.timeout(6_000) })).json()) as { query?: { search?: { title: string }[] } };
    const title = search.query?.search?.[0]?.title;
    if (!title || !titleMatches(title, query)) return null;
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: UA, next: { revalidate: WEEK }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const page = (await res.json()) as { type?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
    if (page.type !== "standard" || !page.extract || page.extract.length < 60) return null;
    return { text: trimExtract(page.extract), source: "wikipedia", url: page.content_urls?.desktop?.page ?? null };
  } catch {
    return null; // Degrade: Wikipedia down means our own line, never an error.
  }
}

/** Our own factual line, from what the asset page already knows. */
function written(o: { name: string; ticker: string; assetClass: string; speculative: boolean; tokens: number }): About {
  const one = o.tokens === 1;
  const n = `${one ? "one token" : `${o.tokens} tokens`}`;
  const track = one ? "tracks" : "track";
  const give = one ? "gives" : "give";
  const t = o.ticker && o.ticker.toLowerCase() !== o.name.toLowerCase() ? ` (${o.ticker})` : "";
  const text = o.speculative
    ? `${o.name} is a private company with no public share. On Solana, ${n} ${give} economic exposure to it through an SPV — speculative, with no ownership, voting or dividend rights. Ratings update as information becomes public.`
    : o.assetClass === "etf"
      ? `${o.name}${t} is an exchange-traded fund. On Solana, ${n} ${track} its shares; each is rated on what you would own and whether you could get back out.`
      : o.assetClass === "metal"
        ? `${o.name} is a commodity. On Solana, ${n} ${track} its price${one ? "." : " — some backed by metal, some following an exchange-traded fund."}`
        : `${o.name}${t} is a publicly listed company. On Solana, ${n} ${track} its shares; each is rated on what you would own and whether you could get back out.`;
  return { text, source: "trova", url: null };
}

const memo = new Map<string, About>();

export async function aboutFor(o: {
  assetId: string;
  issuerText: string | null;
  name: string;
  ticker: string;
  legalName: string | null;
  assetClass: string;
  speculative: boolean;
  tokens: number;
}): Promise<About> {
  if (o.issuerText) return { text: o.issuerText, source: "issuer", url: null };
  const hit = memo.get(o.assetId);
  if (hit) return hit;
  // The legal name ("SPDR S&P 500 ETF Trust", "IREN Limited") finds the right page far more often
  // than a display name ("SP500", "IREN"). Metals are searched by their own name.
  const query = o.assetClass === "metal" ? o.name : o.legalName ?? o.name;
  const about = (await fromWikipedia(query)) ?? written(o);
  memo.set(o.assetId, about);
  return about;
}
