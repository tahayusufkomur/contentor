import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextureOverlay } from "@/components/ui/texture-overlay";

export function HeroSection() {
  const t = useTranslations("marketing.hero");
  return (
    <section className="relative overflow-hidden">
      {/* Warm gradient background */}
      <div className="warm-gradient absolute inset-0" />
      <TextureOverlay />

      {/* Geometric decorations */}
      <div className="absolute top-24 right-12 h-3 w-3 rounded-full bg-primary/30 animate-float" />
      <div className="absolute top-40 right-24 h-2 w-2 rounded-full bg-accent/40 animate-float [animation-delay:1s]" />
      <div className="absolute bottom-32 left-16 h-16 w-px bg-primary/20 animate-float [animation-delay:0.5s]" />

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-20 md:pt-40 md:pb-32 lg:pt-48">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Left side — text */}
          <div className="text-center md:text-left">
            <Badge
              variant="brand"
              className="mb-6 inline-flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("badge")}
            </Badge>

            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              {t("title1")}
              <br />
              <span className="relative inline-block text-primary">
                {t("title2")}
                {/* Hand-drawn wavy SVG underline */}
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 300 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 8c30-6 60 4 90-2s60 4 90-2 60 4 90-2"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="text-primary"
                  />
                </svg>
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:mx-0 md:text-xl">
              {t("subtitle")}
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row md:justify-start">
              <Button
                asChild
                className="h-12 px-8 text-base gap-2"
              >
                <Link href="/signup">
                  {t("ctaPrimary")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button
                asChild
                variant="ghost"
                className="h-12 px-8 text-base gap-2"
              >
                <Link href="#features">
                  <Play className="h-4 w-4" />
                  {t("ctaSecondary")}
                </Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              {t("trustNote")}
            </p>
          </div>

          {/* Right side — decorative element */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative">
              <div className="h-72 w-72 rounded-full border-2 border-primary/15 lg:h-80 lg:w-80" />
              <div className="absolute inset-4 rounded-full border border-accent/20" />
              <div className="absolute inset-12 rounded-full bg-primary/5" />
              <div className="absolute top-8 -right-4 h-4 w-4 rounded-full bg-primary/40 animate-float" />
              <div className="absolute bottom-12 -left-3 h-3 w-3 rounded-full bg-accent/50 animate-float [animation-delay:1.2s]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
