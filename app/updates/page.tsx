import { Shell } from "@/components/trova/shell";
import { UpdatesView } from "@/components/trova/updates-view";

export default function UpdatesPage() {
  return (
    <Shell title="Updates" subtitle="What changed in the tokens we rate every day" active="updates">
      <UpdatesView />
    </Shell>
  );
}
