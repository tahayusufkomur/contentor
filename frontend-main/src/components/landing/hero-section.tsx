"use client";

import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/shared/logo-mark";
import { Parallax } from "@/components/landing/parallax";

export function HeroSection() {
  const t = useTranslations("marketing.hero");

  return (
    <section className="relative isolate overflow-hidden pb-12 pt-28 md:pt-36 lg:pt-44">
      {/* Aurora backdrop with parallax depth */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <Parallax speed={-0.18} className="absolute inset-0">
          <div className="aurora animate-aurora" />
        </Parallax>
        <Parallax speed={0.1} className="absolute inset-0">
          <div className="grid-fade absolute inset-0 opacity-60" />
        </Parallax>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      {/* Floating glass orbs — parallax at different speeds */}
      <Parallax
        speed={0.35}
        className="pointer-events-none absolute left-[8%] top-[18%] hidden md:block"
      >
        <div
          aria-hidden
          className="h-24 w-24 rounded-full glass animate-float"
          style={{ animationDelay: "0.2s" }}
        />
      </Parallax>
      <Parallax
        speed={0.6}
        className="pointer-events-none absolute right-[10%] top-[28%] hidden md:block"
      >
        <div
          aria-hidden
          className="h-16 w-16 rounded-full glass animate-float"
          style={{ animationDelay: "1.1s" }}
        />
      </Parallax>
      <Parallax
        speed={0.5}
        className="pointer-events-none absolute left-[20%] bottom-[14%] hidden md:block"
      >
        <div
          aria-hidden
          className="h-12 w-12 rounded-full glass animate-float"
          style={{ animationDelay: "0.6s" }}
        />
      </Parallax>

      {/* Hero content fades and scales away as the page scrolls past */}
      <div className="hero-scroll-out relative mx-auto max-w-5xl px-6 text-center">
        {/* Eyebrow capsule */}
        <div className="inline-flex animate-fade-in-up items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 backdrop-blur-md">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <Sparkles className="h-3.5 w-3.5 text-foreground/70" />
          <span className="text-[12.5px] font-medium text-foreground/80">
            {t("badge")}
          </span>
        </div>

        {/* Display title — staggered word-block fade */}
        <h1 className="text-display mt-8 text-[44px] leading-[1.02] sm:text-[64px] md:text-[80px] lg:text-[96px]">
          <span
            className="block animate-fade-in-up text-foreground/95"
            style={{ animationDelay: "0.08s" }}
          >
            {t("title1")}
          </span>
          <span
            className="mt-2 block animate-fade-in-up"
            style={{ animationDelay: "0.2s" }}
          >
            <span className="brand-gradient">{t("title2")}</span>
          </span>
        </h1>

        <p
          className="mx-auto mt-7 max-w-2xl animate-fade-in-up text-balance text-[17px] leading-[1.5] text-muted-foreground md:text-[19px]"
          style={{ animationDelay: "0.32s" }}
        >
          {t("subtitle")}
        </p>

        <div
          className="mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.44s" }}
        >
          <Button asChild variant="brand" size="xl" className="gap-2">
            <Link href="/signup">
              {t("ctaPrimary")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl" className="gap-2">
            <Link href="#features">
              <Play className="h-4 w-4" />
              {t("ctaSecondary")}
            </Link>
          </Button>
        </div>

        <p
          className="mt-6 animate-fade-in-up text-[13px] text-muted-foreground/80"
          style={{ animationDelay: "0.56s" }}
        >
          {t("trustNote")}
        </p>

        {/* Hero glyph — refraction halo around the brand mark */}
        <div
          className="relative mx-auto mt-20 flex animate-fade-in-up items-center justify-center"
          style={{ animationDelay: "0.68s" }}
        >
          <div className="absolute h-80 w-80 rounded-full bg-gradient-to-br from-[oklch(0.72_0.22_230)] to-[oklch(0.55_0.24_270)] opacity-35 blur-3xl md:h-[28rem] md:w-[28rem]" />
          <div className="relative flex h-44 w-44 items-center justify-center rounded-[44px] glass-strong md:h-56 md:w-56">
            <LogoMark size={144} priority />
          </div>
        </div>
      </div>
    </section>
  );
}
