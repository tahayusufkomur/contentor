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
          <p className="text-eyebrow text-muted-foreground/80">
            {t("tagline")}
          </p>
        </ScrollReveal>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {CATEGORY_KEYS.map((key, i) => (
            <ScrollReveal
              key={key}
              variant="scale"
              fromScale={0.8}
              duration={0.7}
              delay={0.06 * i}
            >
              <span className="rounded-full border border-border/60 bg-background/40 px-4 py-1.5 text-[13px] font-medium text-foreground/80 backdrop-blur-md">
                {t(`categories.${key}`)}
              </span>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
