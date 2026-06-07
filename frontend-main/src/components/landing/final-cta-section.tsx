"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/shared/logo-mark";

export function FinalCtaSection() {
  const t = useTranslations("marketing.finalCta");
  return (
    <section className="relative isolate overflow-hidden px-6 py-32 md:py-40">
      <div className="relative mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-2xl border bg-card p-12 text-center shadow-sm md:p-16">
          {/* Single soft accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-48 w-2/3 rounded-full bg-marketing-accent opacity-10 blur-3xl"
          />

          <Monogram size={64} className="mx-auto" />

          <h2 className="text-display mt-7 text-4xl text-foreground md:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex justify-center">
            <Button asChild size="xl">
              <Link href="/signup">
                {t("ctaPrimary")}
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">{t("trustNote")}</p>
        </div>
      </div>
    </section>
  );
}
