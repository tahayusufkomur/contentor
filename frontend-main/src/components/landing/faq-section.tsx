"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

const FAQ_KEYS = [
  "freePlan",
  "technical",
  "customDomain",
  "payments",
  "liveClasses",
  "migration",
  "contract",
] as const;

export function FaqSection() {
  const t = useTranslations("marketing.faq");
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-16">
          {FAQ_KEYS.map((key) => (
            <details key={key} className="group border-b">
              <summary className="flex cursor-pointer items-center justify-between py-5 text-left font-display font-medium transition-colors hover:text-primary">
                {t(`items.${key}.q`)}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="faq-content group-open:border-l-2 group-open:border-primary group-open:pl-4">
                <div className="pb-5 text-muted-foreground">{t(`items.${key}.a`)}</div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
