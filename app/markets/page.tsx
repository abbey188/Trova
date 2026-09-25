import { AppFrame } from "@/components/trova/frame";
import { MarketsScreen } from "@/components/trova/markets-screen";

export const metadata = { title: "Markets · Trova" };

export default function MarketsPage() {
  return (
    <AppFrame active="markets">
      <MarketsScreen />
    </AppFrame>
  );
}
