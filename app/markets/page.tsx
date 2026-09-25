import { MarketsView } from "@/components/trova/markets-view";
import { Shell } from "@/components/trova/shell";

export default function MarketsPage() {
  return (
    <Shell title="Markets" subtitle="Every tokenized stock, ETF and metal on Solana, rated" active="markets">
      <MarketsView />
    </Shell>
  );
}
