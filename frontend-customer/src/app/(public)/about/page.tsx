import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { AboutSection } from "@/components/landing/about-section";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  const about = config?.landing_sections?.about;

  if (!about || !about.enabled) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">About</h1>
        <p className="mt-2 text-muted-foreground">
          No about information available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-8 md:-mx-6">
      <AboutSection data={about} />
    </div>
  );
}
