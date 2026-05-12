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
        <ScrollReveal variant="blur" duration={1}>
          <div className="text-center">
            <p className="text-eyebrow text-muted-foreground/80">FAQ</p>
            <h2 className="text-display mt-4 text-4xl md:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">{t("subtitle")}</p>
          </div>
        </ScrollReveal>

        <ScrollReveal variant="scale" fromScale={0.96} duration={1.1}>
          <div className="mt-16 overflow-hidden rounded-3xl border border-border/60 bg-background/40 backdrop-blur-md">
            {FAQ_KEYS.map((key, i) => (
              <details
                key={key}
                className={`group ${
                  i !== FAQ_KEYS.length - 1 ? "border-b border-border/40" : ""
                }`}
              >
                <summary className="flex cursor-pointer items-center justify-between gap-6 px-7 py-5 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-foreground/[0.03]">
                  <span className="tracking-[-0.01em]">{t(`items.${key}.q`)}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70 transition-transform duration-300 group-open:rotate-45">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                </summary>
                <div className="faq-content">
                  <div className="px-7 pb-6 text-[14.5px] leading-relaxed text-muted-foreground">
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
