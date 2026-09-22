import Link from "next/link";

import { Card, Shell } from "@/components/trova/shell";

const EXAMPLES = [
  { id: "tesla", name: "Tesla", note: "two tokens — one of them can't be sold" },
  { id: "spacex", name: "SpaceX", note: "five tokens, three kinds of ownership" },
  { id: "openai", name: "OpenAI", note: "private company, no shares behind it" },
  { id: "gold", name: "Gold", note: "eight tokens, priced per ounce" },
  { id: "micron", name: "Micron", note: "the cheap one costs 8.7% to leave" },
  { id: "microsoft", name: "Microsoft", note: "one deep token, one dead one" },
];

export default function HomePage() {
  return (
    <Shell
      title="Know what you own"
      subtitle="Every tokenized stock on Solana, rated on what you actually own and what it costs to get out"
    >
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3 p-5 md:p-6">
          <h2 className="font-display text-[17px] font-semibold">The same stock exists more than once</h2>
          <p className="max-w-[70ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Tesla has two tokens on Solana. They track the same share, but one of them has no route out at any
            size — and nothing on a price chart tells you which. Trova rates every token on what you&apos;d
            actually own and whether you could sell it, and shows the arithmetic behind each rating.
          </p>
        </Card>

        <div>
          <h2 className="font-display mb-3 text-[15px] font-semibold">Start with one of these</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXAMPLES.map((example) => (
              <Link key={example.id} href={`/asset/${example.id}`}>
                <Card className="flex h-full flex-col gap-1.5 p-4 transition-shadow hover:shadow-md">
                  <span className="font-display text-[15px] font-semibold">{example.name}</span>
                  <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    {example.note}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
