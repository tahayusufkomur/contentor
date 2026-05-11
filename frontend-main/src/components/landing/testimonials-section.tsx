"use client";

import { useTranslations } from "next-intl";

const TESTIMONIAL_KEYS = ["sarah", "marcus", "priya"] as const;
const TESTIMONIAL_BG: Record<(typeof TESTIMONIAL_KEYS)[number], string> = {
  sarah: "bg-brand-surface",
  marcus: "bg-primary/5",
  priya: "bg-accent/5",
};

export function TestimonialsSection() {
  const t = useTranslations("marketing.testimonials");
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-center text-3xl font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h2>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {TESTIMONIAL_KEYS.map((key, i) => (
            <div
              key={key}
              className={`relative rounded-xl border ${TESTIMONIAL_BG[key]} p-6 shadow-sm ${i === 1 ? "md:mt-8" : ""}`}
            >
              <span className="absolute -top-2 -left-1 text-6xl font-display text-primary/10 select-none">
                &ldquo;
              </span>
              <p className="italic text-muted-foreground">
                &ldquo;{t(`items.${key}.quote`)}&rdquo;
              </p>

              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary/60 to-accent/60" />
                <div>
                  <p className="text-sm font-semibold">{t(`items.${key}.name`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`items.${key}.role`)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
