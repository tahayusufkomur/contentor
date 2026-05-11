"use client";

import { BookOpen, Check, Globe, Video, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

function CourseIllustration({ progressLabel, lessons }: { progressLabel: string; lessons: (n: number) => string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="h-16 rounded-t-lg bg-primary/10" />
        <div className="space-y-3 p-3">
          <div className="h-3 w-3/4 rounded bg-gray-200" />
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{progressLabel}</span>
              <span>75%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
              <div className="h-1.5 w-3/4 rounded-full bg-primary" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">{lessons(12)}</p>
        </div>
      </div>
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="h-16 rounded-t-lg bg-accent/10" />
        <div className="space-y-3 p-3">
          <div className="h-3 w-2/3 rounded bg-gray-200" />
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{progressLabel}</span>
              <span>40%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
              <div className="h-1.5 w-2/5 rounded-full bg-accent" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">{lessons(8)}</p>
        </div>
      </div>
    </div>
  );
}

function LiveClassIllustration({ live, watching }: { live: string; watching: (n: number) => string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-gray-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{live}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="aspect-video rounded bg-gray-700" />
        <div className="aspect-video rounded bg-gray-700" />
        <div className="aspect-video rounded bg-gray-700" />
        <div className="aspect-video rounded bg-gray-700" />
      </div>
      <div className="mt-3 text-center">
        <span className="text-xs text-gray-400">{watching(847)}</span>
      </div>
    </div>
  );
}

function BrandingIllustration() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="h-2 bg-primary" />
        <div className="space-y-2 p-2">
          <div className="h-8 rounded bg-primary/5" />
          <div className="h-2 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        </div>
        <div className="h-2 bg-accent" />
        <div className="space-y-2 p-2">
          <div className="h-8 rounded bg-accent/10" />
          <div className="h-2 w-2/3 rounded bg-gray-200" />
          <div className="h-2 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function AutomationIllustration({ step3 }: { step3: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full rounded-lg border bg-card px-4 py-3 text-center text-sm font-medium shadow-sm">
        New student signs up
      </div>
      <div className="flex h-8 flex-col items-center justify-center">
        <div className="h-full w-px bg-gray-300" />
        <div className="h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-300" />
      </div>
      <div className="w-full rounded-lg border bg-card px-4 py-3 text-center text-sm font-medium shadow-sm">
        Send welcome email
      </div>
      <div className="flex h-8 flex-col items-center justify-center">
        <div className="h-full w-px bg-gray-300" />
        <div className="h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-300" />
      </div>
      <div className="w-full rounded-lg border bg-primary/5 px-4 py-3 text-center text-sm font-medium shadow-sm">
        {step3}
      </div>
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
    <section id="features" className="px-6 py-32 md:py-40">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-20">
          {FEATURE_KEYS.map((key, index) => {
            const Icon = FEATURE_ICONS[key];
            return (
              <div key={key}>
                <div
                  className={`grid items-center gap-16 py-20 md:grid-cols-2 ${
                    index % 2 !== 0 ? "md:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <div>
                    <Icon className="h-8 w-8 text-primary" />
                    <h3 className="font-display mt-4 text-2xl font-bold">{t(`items.${key}.title`)}</h3>
                    <p className="mt-2 text-muted-foreground">{t(`items.${key}.description`)}</p>
                    <ul className="mt-6 space-y-3">
                      {POINT_KEYS[key].map((pointKey) => (
                        <li key={pointKey} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          <span className="text-sm">{t(`items.${key}.points.${pointKey}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border bg-card p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1">
                    {illustrations[key]}
                  </div>
                </div>
                {index < FEATURE_KEYS.length - 1 && <div className="h-px bg-border" />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
