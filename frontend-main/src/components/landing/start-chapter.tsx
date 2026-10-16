import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";
import { NavLink } from "@/components/ui/nav-link";
import { teaserRows } from "@/lib/plans";
import { fetchPlans } from "@/lib/plans-server";

/** Three plan names with live prices from the same fetch pricing uses. When
 * Django does not answer, the names render without a price (Review Focus 5);
 * `live={false}` is that names-only render, the Suspense fallback the page
 * streams first. */
async function PricingTeaser({ live = true }: { live?: boolean }) {
  const [t, tp, plans] = await Promise.all([
    getTranslations("marketing.start.pricing"),
    getTranslations("pricing.plans"),
    live ? fetchPlans() : null,
  ]);
  const rows = teaserRows(plans);
  return (
    <section
      aria-labelledby="teaser-title"
      className="mx-auto max-w-media px-6"
    >
      <h2 id="teaser-title" className="text-title text-foreground">
        {t("title")}
      </h2>
      <p className="mt-3 max-w-[640px] text-body-lg text-muted-foreground">
        {t("text")}
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {rows.map(({ key, price }) => (
          <div key={key} className="rounded-tile bg-muted p-7">
            <p className="text-caption font-semibold text-foreground">
              {tp(`${key}.name`)}
            </p>
            {price && (
              <p className="mt-3 text-title text-foreground">
                {price}
                <span className="ml-1.5 text-caption font-normal text-muted-foreground">
                  {tp(`${key}.period`)}
                </span>
              </p>
            )}
            <p className="mt-3 text-body text-muted-foreground">
              {tp(`${key}.description`)}
            </p>
          </div>
        ))}
      </div>
      <NavLink
        href="/pricing"
        className="mt-6 inline-block text-body text-marketing-accent hover:underline"
      >
        {t("cta")}
      </NavLink>
    </section>
  );
}

/** The close: the pricing teaser, the FAQ and the last call, each on second
 * paper. */
export function StartChapter() {
  return (
    <div id="start" className="scroll-mt-24 pb-16 md:pb-24">
      <Suspense fallback={<PricingTeaser live={false} />}>
        <PricingTeaser />
      </Suspense>
      <FaqSection />
      <FinalCtaSection />
    </div>
  );
}
