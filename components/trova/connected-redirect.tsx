"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useWalletAddress } from "@/components/trova/wallet";

/** Once a wallet is connected, the landing page has done its job: go to that wallet's portfolio. */
export function ConnectedRedirect() {
  const address = useWalletAddress();
  const router = useRouter();
  useEffect(() => {
    if (address) router.replace(`/p/${address}`);
  }, [address, router]);
  return null;
}
