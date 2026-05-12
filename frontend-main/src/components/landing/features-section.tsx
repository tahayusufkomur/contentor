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
        { bar: "from-[oklch(0.72_0.22_230)] to-[oklch(0.55_0.22_270)]", pct: 75, n: 12 },
        { bar: "from-[oklch(0.78_0.18_220)] to-[oklch(0.62_0.24_232)]", pct: 40, n: 8 },
      ].map((c, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border/60 bg-background/50 backdrop-blur-md"
        >
          <div className={`h-14 bg-gradient-to-br ${c.bar} opacity-80`} />
          <div className="space-y-3 p-3.5">
            <div className="h-2.5 w-3/4 rounded-full bg-foreground/10" />
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{progressLabel}</span>
                <span>{c.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-foreground/[0.06]">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-[oklch(0.62_0.24_232)] to-[oklch(0.55_0.22_270)]"
                  style={{ width: `${c.pct}%` }}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">{lessons(c.n)}</p>
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
    <div className="overflow-hidden rounded-2xl bg-foreground p-4 text-background">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          {live}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-video rounded-lg bg-gradient-to-br from-white/10 to-white/5"
          />
        ))}
      </div>
      <div className="mt-3 text-center text-[11px] text-white/60">
        {watching(847)}
      </div>
    </div>
  );
}

function BrandingIllustration() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { bar: "bg-[oklch(0.62_0.24_232)]", tint: "bg-[oklch(0.62_0.24_232)]/10" },
        { bar: "bg-[oklch(0.78_0.18_220)]", tint: "bg-[oklch(0.78_0.18_220)]/10" },
      ].map((c, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border/60 bg-background/50 backdrop-blur-md"
        >
          <div className="flex items-center gap-1 bg-foreground/[0.04] px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-400/80" />
          </div>
          <div className={`h-2 ${c.bar}`} />
          <div className="space-y-2 p-2.5">
            <div className={`h-8 rounded-md ${c.tint}`} />
            <div className="h-1.5 w-3/4 rounded-full bg-foreground/10" />
            <div className="h-1.5 w-1/2 rounded-full bg-foreground/10" />
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
            className={`w-full rounded-xl border px-4 py-3 text-center text-[13px] font-medium backdrop-blur-md ${
              i === steps.length - 1
                ? "border-primary/30 bg-primary/[0.08] text-foreground"
                : "border-border/60 bg-background/50 text-foreground/85"
            }`}
          >
            {label}
          </div>
          {i < steps.length - 1 && (
            <div className="mx-auto my-1 h-4 w-px bg-foreground/15" />
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
  const illustrations: Record<(typeof FEATURE_KEYS)[number], React.ReactNode> = {
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
    autopilot: <AutomationIllustration step3={t("illustrations.automationStep3")} />,
  };

  return (
    <section id="features" className="relative px-6 py-32 md:py-40">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal variant="blur" duration={1}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow text-muted-foreground/80">Capabilities</p>
            <h2 className="text-display mt-4 text-4xl sm:text-5xl md:text-6xl">
              {t("title")}
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground md:text-lg">
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
                <ScrollReveal
                  direction={isRight ? "left" : "right"}
                  duration={1}
                >
                  <div>
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.72_0.22_230)] to-[oklch(0.55_0.24_270)] text-white shadow-glow-blue">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-headline mt-6 text-3xl md:text-4xl">
                      {t(`items.${key}.title`)}
                    </h3>
                    <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
                      {t(`items.${key}.description`)}
                    </p>
                    <ul className="mt-6 space-y-3">
                      {POINT_KEYS[key].map((pointKey) => (
                        <li key={pointKey} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-primary">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          <span className="text-[14.5px] text-foreground/85">
                            {t(`items.${key}.points.${pointKey}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </ScrollReveal>
                <ScrollReveal
                  variant="scale"
                  fromScale={0.92}
                  duration={1.1}
                  delay={0.08}
                >
                  <div className="relative">
                    <div className="absolute inset-x-8 top-6 -z-10 h-44 rounded-full bg-gradient-to-r from-[oklch(0.72_0.22_230)] to-[oklch(0.55_0.24_270)] opacity-20 blur-3xl" />
                    <div className="glass-pane p-6">{illustrations[key]}</div>
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
