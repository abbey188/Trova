"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Sheet } from "@/components/trova/frame";
import { HelpContent } from "@/components/trova/help-content";
import { ConnectButton, useWalletAddress } from "@/components/trova/wallet";

/** Once a wallet connects, the landing page has done its job: go to that wallet's home. */
export function ConnectedRedirect() {
  const address = useWalletAddress();
  const router = useRouter();
  useEffect(() => { if (address) router.replace(`/p/${address}`); }, [address, router]);
  return null;
}

/** "How ratings work" on the landing header — the same panel the app's ? opens. */
export function HowItWorksLink({ style }: { style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", padding: "12px 18px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", ...style }}>
        How ratings work
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="How ratings work">
        <HelpContent onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

export function LandingConnect({ size = "md" }: { size?: "md" | "lg" | "hero" }) {
  return <ConnectButton size={size} />;
}

export function BrowseMarkets({ full }: { full?: boolean }) {
  return (
    <Link href="/markets" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", fontSize: 15, fontWeight: 600, color: "var(--ink)", border: "1px solid var(--hairline)", borderRadius: full ? 15 : 13, padding: full ? 17 : "17px 26px", textDecoration: "none", minHeight: 54, boxSizing: "border-box", width: full ? "100%" : undefined }}>
      Browse markets
    </Link>
  );
}
