import { notFound } from "next/navigation";

import { PortfolioView } from "@/components/trova/portfolio-view";
import { Shell } from "@/components/trova/shell";
import { isSolanaAddress } from "@/lib/helius";

export default async function PortfolioPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isSolanaAddress(address)) notFound();
  return (
    <Shell title="Home" active="home">
      <PortfolioView address={address} />
    </Shell>
  );
}
