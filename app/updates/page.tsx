import { AppFrame } from "@/components/trova/frame";
import { UpdatesScreen } from "@/components/trova/updates-screen";

export const metadata = { title: "Updates · Trova" };

export default function UpdatesPage() {
  return (
    <AppFrame active="updates">
      <UpdatesScreen />
    </AppFrame>
  );
}
