import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FAQ_KEYS } from "@/lib/landing";

/** FAQ (spec 5.4 ch. 8): <details> with a shared `name`, so the browser keeps
 * one open at a time and all start closed (Review Focus 4); the chevron turns
 * with `group-open:`; the `.faq-content` grid-rows transition in globals.css
 * stays. */
export async function FaqSection() {
  const t = await getTranslations("marketing.start.faq");
  return (
    <section
      aria-labelledby="faq-title"
      className="mx-auto mt-24 max-w-text px-6"
    >
      <h3 id="faq-title" className="text-title text-foreground">
        {t("title")}
      </h3>
      <div className="mt-8 border-t">
        {FAQ_KEYS.map((key) => (
          <details key={key} name="landing-faq" className="group border-b">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-body font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <span>{t(`items.${key}.q`)}</span>
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-300 group-open:rotate-180"
              />
            </summary>
            <div className="faq-content">
              <div className="pb-6 text-body text-muted-foreground">
                {t(`items.${key}.a`)}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
