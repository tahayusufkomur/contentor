import { getTranslations } from "next-intl/server";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchDynamicData } from "@/lib/blocks/fetch-dynamic-data";
import { PageView } from "@/components/blocks/page-view";

export async function generateMetadata() {
  const t = await getTranslations("site");
  return { title: t("page.plans") };
}

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const t = await getTranslations("site");
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const blocks = config?.pages?.pricing?.blocks ?? [];
  const dynamicData = await fetchDynamicData(blocks);
  return (
    <PageView
      pageKey="pricing"
      blocks={blocks}
      dynamicData={dynamicData}
      pageTitle={t("page.pricing")}
    />
  );
}
