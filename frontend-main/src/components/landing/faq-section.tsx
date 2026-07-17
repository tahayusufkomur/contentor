"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

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
        <ScrollReveal direction="up" duration={0.7}>
          <div className="text-center">
            <p className="text-eyebrow text-muted-foreground">FAQ</p>
            <h2 className="text-display mt-4 text-4xl text-foreground md:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal direction="up" duration={0.7}>
          <div className="mt-16 overflow-hidden rounded-xl border bg-card shadow-sm">
            {FAQ_KEYS.map((key, i) => (
              <details
                key={key}
                className={`group ${i !== FAQ_KEYS.length - 1 ? "border-b" : ""}`}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-6 px-7 py-5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
                  <span>{t(`items.${key}.q`)}</span>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-300 group-open:rotate-45">
                    <Plus className="size-3.5" strokeWidth={2.5} />
                  </span>
                </summary>
                <div className="faq-content">
                  <div className="px-7 pb-6 text-sm leading-relaxed text-muted-foreground">
                    {t(`items.${key}.a`)}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
