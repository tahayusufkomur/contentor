import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchDynamicData } from "@/lib/blocks/fetch-dynamic-data";
import { PageRenderer } from "@/components/blocks/page-renderer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const blocks = config?.pages?.home?.blocks ?? [];
  const dynamicData = await fetchDynamicData(blocks);
  return <PageRenderer blocks={blocks} dynamicData={dynamicData} />;
}
