"use client";

import { useTranslations } from "next-intl";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const CATEGORY_KEYS = ["fitness", "music", "dance", "education", "wellness"] as const;

export function SocialProofBar() {
  const t = useTranslations("marketing.socialProof");
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl text-center">
        <ScrollReveal variant="blur" duration={0.9}>
          <p className="text-eyebrow text-muted-foreground">
            {t("tagline")}
          </p>
        </ScrollReveal>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {CATEGORY_KEYS.map((key, i) => (
            <ScrollReveal key={key} direction="up" duration={0.6} delay={0.06 * i}>
              <span className="rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
                {t(`categories.${key}`)}
              </span>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
