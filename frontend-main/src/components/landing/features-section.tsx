"use client";

import { BookOpen, Check, Globe, Video, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

function CourseIllustration({
  progressLabel,
  lessons,
}: {
  progressLabel: string;
  lessons: (n: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { bar: "bg-chart-1", pct: 75, n: 12 },
        { bar: "bg-chart-2", pct: 40, n: 8 },
      ].map((c, i) => (
        <div key={i} className="overflow-hidden rounded-lg border bg-card">
          <div className={`h-14 ${c.bar} opacity-80`} />
          <div className="space-y-3 p-3.5">
            <div className="h-2.5 w-3/4 rounded-full bg-muted" />
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progressLabel}</span>
                <span className="tabular-nums">{c.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-marketing-accent"
                  style={{ width: `${c.pct}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{lessons(c.n)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LiveClassIllustration({
  live,
  watching,
}: {
  live: string;
  watching: (n: number) => string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-foreground p-4 text-background">
      <div className="mb-3 flex items-center gap-2">
        <span className="size-2 animate-pulse rounded-full bg-destructive" />
        <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold tracking-wide text-white">
          {live}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-video rounded-md bg-background/10" />
        ))}
      </div>
      <div className="mt-3 text-center text-xs text-background/60">
        {watching(847)}
      </div>
    </div>
  );
}

function BrandingIllustration() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[{ bar: "bg-chart-1" }, { bar: "bg-chart-2" }].map((c, i) => (
        <div key={i} className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center gap-1 bg-muted px-2 py-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
          </div>
          <div className={`h-2 ${c.bar}`} />
          <div className="space-y-2 p-2.5">
            <div className={`h-8 rounded-md ${c.bar} opacity-10`} />
            <div className="h-1.5 w-3/4 rounded-full bg-muted" />
            <div className="h-1.5 w-1/2 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AutomationIllustration({ step3 }: { step3: string }) {
  const steps = ["New student signs up", "Send welcome email", step3];
  return (
    <div className="flex flex-col items-center gap-2">
      {steps.map((label, i) => (
        <div key={i} className="w-full">
          <div
            className={`w-full rounded-md border px-4 py-3 text-center text-sm font-medium ${
              i === steps.length - 1
                ? "border-marketing-accent/40 bg-marketing-accent/10 text-foreground"
                : "bg-card text-muted-foreground"
            }`}
          >
            {label}
          </div>
          {i < steps.length - 1 && (
            <div className="mx-auto my-1 h-4 w-px bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}

const FEATURE_KEYS = ["courses", "live", "branding", "autopilot"] as const;
const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], LucideIcon> = {
  courses: BookOpen,
  live: Video,
  branding: Globe,
  autopilot: Zap,
};
const POINT_KEYS: Record<(typeof FEATURE_KEYS)[number], readonly string[]> = {
  courses: ["video", "modular", "enrollment", "drip"],
  live: ["webrtc", "chat", "recording", "scheduling"],
  branding: ["domain", "colors", "whitelabel", "mobile"],
  autopilot: ["email", "subscriptions", "stripe", "automation"],
};

export function FeaturesSection() {
  const t = useTranslations("marketing.features");
  const illustrations: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> =
    {
      courses: (
        <CourseIllustration
          progressLabel={t("illustrations.progress")}
          lessons={(count) => t("illustrations.lessonsCount", { count })}
        />
      ),
      live: (
        <LiveClassIllustration
          live={t("illustrations.live")}
          watching={(count) => t("illustrations.watchingCount", { count })}
        />
      ),
      branding: <BrandingIllustration />,
      autopilot: (
        <AutomationIllustration step3={t("illustrations.automationStep3")} />
      ),
    };

  return (
    <section id="features" className="relative px-6 py-32 md:py-40">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal direction="up" duration={0.7}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-muted-foreground">Capabilities</p>
            <h2 className="text-display mt-4 text-4xl text-foreground sm:text-5xl md:text-6xl">
              {t("title")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-24 space-y-28">
          {FEATURE_KEYS.map((key, index) => {
            const Icon = FEATURE_ICONS[key];
            const isRight = index % 2 !== 0;
            return (
              <div
                key={key}
                className={`grid items-center gap-12 md:grid-cols-2 md:gap-20 ${
                  isRight ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                <ScrollReveal direction="up" duration={0.7}>
                  <div>
                    <div className="inline-flex size-11 items-center justify-center rounded-lg bg-marketing-accent/10 text-marketing-accent">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="text-headline mt-6 text-3xl text-foreground md:text-4xl">
                      {t(`items.${key}.title`)}
                    </h3>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                      {t(`items.${key}.description`)}
                    </p>
                    <ul className="mt-6 space-y-3">
                      {POINT_KEYS[key].map((pointKey) => (
                        <li key={pointKey} className="flex items-start gap-3">
                          <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-marketing-accent/15 text-marketing-accent">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                          <span className="text-sm text-foreground">
                            {t(`items.${key}.points.${pointKey}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </ScrollReveal>
                <ScrollReveal direction="up" duration={0.7} delay={0.08}>
                  <div className="rounded-xl border bg-card p-6 shadow-sm">
                    {illustrations[key]}
                  </div>
                </ScrollReveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
