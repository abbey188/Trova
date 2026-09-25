import { AppFrame } from "@/components/trova/frame";
import { HelpContent } from "@/components/trova/help-content";

export const metadata = { title: "How ratings work · Trova" };

// The ? is a panel everywhere in the app. This page exists only so an old or shared /help link
// still lands on the same content, inside the app frame.
export default function HelpPage() {
  return (
    <AppFrame active="none">
      <div style={{ maxWidth: 1000, width: "100%", margin: "0 auto", background: "var(--surface)", minHeight: "100%" }}>
        <HelpContent />
      </div>
    </AppFrame>
  );
}
