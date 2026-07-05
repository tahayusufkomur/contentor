"use client";

import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/logo-mark";

export function HeroSection() {
  const t = useTranslations("marketing.hero");

  return (
    <section className="relative isolate overflow-hidden pb-12 pt-28 md:pt-36 lg:pt-44">
      {/* Restrained backdrop: faint grid + a single marketing-accent glow */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="grid-fade absolute inset-0" />
        <div className="aurora" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="hero-scroll-out relative mx-auto max-w-5xl px-6 text-center">
        {/* Eyebrow capsule */}
        <div className="inline-flex animate-fade-in-up items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-sm">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-marketing-accent opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-marketing-accent" />
          </span>
          <Sparkles className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {t("badge")}
          </span>
        </div>

        {/* Display title */}
        <h1 className="text-display mt-8 text-[44px] leading-[1.02] sm:text-[64px] md:text-[80px] lg:text-[96px]">
          <span
            className="block animate-fade-in-up text-foreground"
            style={{ animationDelay: "0.08s" }}
          >
            {t("title1")}
          </span>
          <span
            className="mt-2 block animate-fade-in-up text-marketing-accent"
            style={{ animationDelay: "0.2s" }}
          >
            {t("title2")}
          </span>
        </h1>

        <p
          className="mx-auto mt-7 max-w-2xl animate-fade-in-up text-balance text-lg leading-relaxed text-muted-foreground"
          style={{ animationDelay: "0.32s" }}
        >
          {t("subtitle")}
        </p>

        <div
          className="mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.44s" }}
        >
          <Button asChild size="xl">
            <Link href="/signup">
              {t("ctaPrimary")}
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <Link href="/demo">
              <Play />
              {t("ctaSecondary")}
            </Link>
          </Button>
        </div>

        <p
          className="mt-6 animate-fade-in-up text-xs text-muted-foreground"
          style={{ animationDelay: "0.56s" }}
        >
          {t("trustNote")}
        </p>

        {/* Brand plate — framed wordmark with a soft accent glow behind */}
        <div
          className="relative mx-auto mt-20 flex animate-fade-in-up items-center justify-center"
          style={{ animationDelay: "0.68s" }}
        >
          <div
            aria-hidden
            className="absolute h-40 w-80 rounded-full bg-marketing-accent opacity-10 blur-3xl"
          />
          <div className="relative rounded-2xl border bg-card px-10 py-7 shadow-sm">
            <Wordmark className="text-4xl md:text-5xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
