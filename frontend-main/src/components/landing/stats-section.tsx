"use client";

import { useTranslations } from "next-intl";
import { Counter } from "@/components/landing/counter";

const STAT_KEYS = ["earned", "students", "launch"] as const;

export function StatsSection() {
  const t = useTranslations("marketing.stats");
  return (
    <section className="relative px-6 py-28 md:py-36">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border bg-card p-10 shadow-sm md:p-14">
          <div className="grid gap-10 text-center md:grid-cols-3">
            {STAT_KEYS.map((key, i) => (
              <div
                key={key}
                className="animate-fade-in-up"
                style={{ animationDelay: `${i * 0.12}s` }}
              >
                <p className="text-display text-5xl tabular-nums text-foreground md:text-6xl">
                  <Counter value={t(`${key}.value`)} duration={1600} />
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
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
