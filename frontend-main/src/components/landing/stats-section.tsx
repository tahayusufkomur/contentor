"use client";

import { useTranslations } from "next-intl";
import { Counter } from "@/components/landing/counter";
import { Parallax } from "@/components/landing/parallax";

const STAT_KEYS = ["earned", "students", "launch"] as const;

export function StatsSection() {
  const t = useTranslations("marketing.stats");
  return (
    <section className="relative isolate overflow-hidden px-6 py-28 md:py-36">
      <Parallax speed={-0.15} className="absolute inset-0 -z-10">
        <div className="aurora-soft" />
      </Parallax>

      <div className="mx-auto max-w-5xl">
        <div className="glass-pane relative overflow-hidden p-10 md:p-14">
          <div className="grid gap-10 text-center md:grid-cols-3">
            {STAT_KEYS.map((key, i) => (
              <div
                key={key}
                className="relative animate-fade-in-up"
                style={{ animationDelay: `${i * 0.12}s` }}
              >
                <p className="brand-gradient text-display text-5xl md:text-6xl">
                  <Counter value={t(`${key}.value`)} duration={1600} />
                </p>
                <p className="mt-3 text-[14px] text-muted-foreground">
                  {t(`${key}.label`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
