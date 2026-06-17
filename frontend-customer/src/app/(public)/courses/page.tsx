import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchDynamicData } from "@/lib/blocks/fetch-dynamic-data";
import { PageView } from "@/components/blocks/page-view";
import { PAGE_LABELS } from "@/lib/blocks/pages";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const blocks = config?.pages?.courses?.blocks ?? [];
  const dynamicData = await fetchDynamicData(blocks);
  return <PageView pageKey="courses" blocks={blocks} dynamicData={dynamicData} pageTitle={PAGE_LABELS.courses} />;
}
