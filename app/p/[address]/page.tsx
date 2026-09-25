import { notFound } from "next/navigation";

import { AppFrame } from "@/components/trova/frame";
import { HomeScreen } from "@/components/trova/home";
import { isSolanaAddress } from "@/lib/helius";

// /p/<wallet> is Home for that wallet; /p/demo is the demo portfolio shown before a wallet connects.
export default async function HomePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (address !== "demo" && !isSolanaAddress(address)) notFound();
  return (
    <AppFrame active="home">
      <HomeScreen address={address} />
    </AppFrame>
  );
}
