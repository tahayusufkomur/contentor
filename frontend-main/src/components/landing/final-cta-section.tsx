"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/shared/logo-mark";
import { Parallax } from "@/components/landing/parallax";

export function FinalCtaSection() {
  const t = useTranslations("marketing.finalCta");
  return (
    <section className="relative isolate overflow-hidden px-6 py-32 md:py-40">
      <Parallax speed={-0.2} className="absolute inset-0 -z-10">
        <div className="aurora animate-aurora" />
      </Parallax>

      <div className="relative mx-auto max-w-4xl">
        <div className="glass-pane relative overflow-hidden p-12 text-center md:p-16">
          <div
            aria-hidden
            className="absolute inset-x-12 -top-24 -z-10 h-48 rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] via-[oklch(0.55_0.24_270)] to-[oklch(0.7_0.2_210)] opacity-40 blur-3xl"
          />

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl glass-strong">
            <LogoMark size={56} />
          </div>

          <h2 className="text-display mt-7 text-4xl md:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16.5px] leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex justify-center">
            <Button asChild variant="brand" size="xl" className="gap-2">
              <Link href="/signup">
                {t("ctaPrimary")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <p className="mt-5 text-[13px] text-muted-foreground/80">
            {t("trustNote")}
          </p>
        </div>
      </div>
    </section>
  );
}
