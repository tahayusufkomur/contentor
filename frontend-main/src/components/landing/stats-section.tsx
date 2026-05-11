"use client";

import { useTranslations } from "next-intl";

import { TextureOverlay } from "@/components/ui/texture-overlay";

const STAT_KEYS = ["earned", "students", "launch"] as const;

export function StatsSection() {
  const t = useTranslations("marketing.stats");
  return (
    <section className="relative overflow-hidden bg-foreground px-6 py-24 text-background md:py-32">
      <TextureOverlay opacity={0.04} />
      <div
        className="bg-dot-pattern absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-4xl gap-8 text-center md:grid-cols-3">
        {STAT_KEYS.map((key) => (
          <div key={key}>
            <p className="font-display text-primary text-4xl font-bold tracking-tighter md:text-5xl">
              {t(`${key}.value`)}
            </p>
            <p className="mt-2 text-sm text-background/60">{t(`${key}.label`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
