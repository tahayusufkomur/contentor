import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchDynamicData } from "@/lib/blocks/fetch-dynamic-data";
import { PageView } from "@/components/blocks/page-view";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const blocks = config?.pages?.home?.blocks ?? [];
  const dynamicData = await fetchDynamicData(blocks);
  return <PageView pageKey="home" blocks={blocks} dynamicData={dynamicData} />;
}
