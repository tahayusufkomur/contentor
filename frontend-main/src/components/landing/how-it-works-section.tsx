"use client";

import { useTranslations } from "next-intl";

const STEP_KEYS = ["one", "two", "three"] as const;
const STEP_NUMBERS = { one: "1", two: "2", three: "3" } as const;

export function HowItWorksSection() {
  const t = useTranslations("marketing.howItWorks");
  return (
    <section className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-display text-center text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>

        <div className="relative mt-20 grid gap-8 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-8 hidden h-px border-t border-primary/30 md:block" />

          {STEP_KEYS.map((key) => (
            <div key={key} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-background">
                <span className="font-display text-xl font-bold">{STEP_NUMBERS[key]}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(`steps.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
