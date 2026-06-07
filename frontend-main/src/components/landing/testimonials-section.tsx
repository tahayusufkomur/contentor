"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const TESTIMONIAL_KEYS = ["sarah", "marcus", "priya"] as const;

export function TestimonialsSection() {
  const t = useTranslations("marketing.testimonials");
  return (
    <section className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal direction="up" duration={0.7}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-muted-foreground">Loved by creators</p>
            <h2 className="text-display mt-4 text-4xl text-foreground md:text-5xl">
              {t("title")}
            </h2>
          </div>
        </ScrollReveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TESTIMONIAL_KEYS.map((key, i) => (
            <ScrollReveal key={key} direction="up" duration={0.7} delay={i * 0.1}>
              <figure
                className={`relative flex h-full flex-col rounded-xl border bg-card p-7 shadow-sm ${
                  i === 1 ? "md:translate-y-8" : ""
                }`}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 32 32"
                  className="size-7 text-border"
                  fill="currentColor"
                >
                  <path d="M9.4 8C6.4 8 4 10.4 4 13.4c0 3 2.4 5.4 5.4 5.4h.6v.6c0 2.4-2 4.4-4.4 4.4H5v3h1c4 0 7.4-3.4 7.4-7.4V13.4C13.4 10.4 11 8 9.4 8zm13 0c-3 0-5.4 2.4-5.4 5.4 0 3 2.4 5.4 5.4 5.4h.6v.6c0 2.4-2 4.4-4.4 4.4H18v3h1c4 0 7.4-3.4 7.4-7.4V13.4c0-3-2.4-5.4-5.4-5.4z" />
                </svg>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                  &ldquo;{t(`items.${key}.quote`)}&rdquo;
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t pt-5">
                  <div className="size-10 shrink-0 rounded-full bg-marketing-accent/15" />
                  <div>
                    <p className="text-sm font-medium">{t(`items.${key}.name`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`items.${key}.role`)}</p>
                  </div>
                </figcaption>
              </figure>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
