"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const STEP_KEYS = ["one", "two", "three"] as const;

export function HowItWorksSection() {
  const t = useTranslations("marketing.howItWorks");
  return (
    <section className="relative px-6 py-32 md:py-40">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal direction="up" duration={0.7}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-muted-foreground">In three steps</p>
            <h2 className="text-display mt-4 text-4xl text-foreground md:text-5xl">
              {t("title")}
            </h2>
          </div>
        </ScrollReveal>

        <div className="relative mt-20 grid gap-10 md:grid-cols-3">
          {/* Connector line on desktop */}
          <div
            aria-hidden
            className="absolute left-12 right-12 top-7 hidden h-px bg-border md:block"
          />

          {STEP_KEYS.map((key, i) => (
            <ScrollReveal key={key} direction="up" duration={0.7} delay={i * 0.12}>
              <div className="relative text-center">
                <div className="relative mx-auto inline-flex size-14 items-center justify-center rounded-full border bg-card shadow-sm">
                  <span className="text-display text-lg tabular-nums text-marketing-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="text-headline mt-6 text-xl text-foreground">
                  {t(`steps.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`steps.${key}.description`)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
