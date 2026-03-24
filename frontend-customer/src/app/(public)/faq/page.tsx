import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { FaqSection } from "@/components/landing/faq-section";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const faq = config?.landing_sections?.faq;

  if (!faq || !faq.enabled || !faq.items?.length) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">FAQ</h1>
        <p className="mt-2 text-muted-foreground">
          No frequently asked questions available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-8 md:-mx-6">
      <FaqSection data={faq} />
    </div>
  );
}
