"use client";

import Link from "next/link";
import { ArrowRight, Handshake, Percent, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

const PERKS = [
  { key: "concierge", Icon: Handshake },
  { key: "discount", Icon: Percent },
  { key: "featured", Icon: Star },
] as const;

export function FoundingCreatorsSection() {
  const t = useTranslations("marketing.foundingCreators");
  return (
    <section className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal direction="up" duration={0.7}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-muted-foreground">{t("eyebrow")}</p>
            <h2 className="text-display mt-4 text-4xl text-foreground md:text-5xl">
              {t("title")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {PERKS.map(({ key, Icon }, i) => (
            <ScrollReveal
              key={key}
              direction="up"
              duration={0.7}
              delay={i * 0.1}
            >
              <div className="flex h-full flex-col rounded-xl border bg-card p-7 shadow-sm">
                <div className="flex size-10 items-center justify-center rounded-lg bg-marketing-accent/15">
                  <Icon className="size-5 text-marketing-accent" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-foreground">
                  {t(`perks.${key}.title`)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {t(`perks.${key}.description`)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal direction="up" duration={0.7} delay={0.2}>
          <div className="mt-12 flex flex-col items-center gap-3">
            <Button asChild size="xl">
              <Link href="/signup">
                {t("cta")}
                <ArrowRight />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">{t("note")}</p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
