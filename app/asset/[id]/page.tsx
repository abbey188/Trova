import { notFound } from "next/navigation";

import { AssetScreen } from "@/components/trova/asset-screen";
import { AppFrame } from "@/components/trova/frame";
import { buildAssetDetail } from "@/lib/asset";

export const revalidate = 120;

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await buildAssetDetail(decodeURIComponent(id));
  if (!detail) notFound();
  return (
    <AppFrame active="markets">
      <AssetScreen detail={detail} />
    </AppFrame>
  );
}
