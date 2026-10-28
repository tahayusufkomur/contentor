"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { earnings, type PaidPlan, type PlanTerms } from "@/lib/earnings";
import { cn } from "@/lib/utils";

const PLANS: PaidPlan[] = ["starter", "pro"];

function Slider({
  id,
  label,
  value,
  shown,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  shown: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-body text-foreground">
          {label}
        </label>
        <output
          htmlFor={id}
          className="text-title-2 tabular-nums text-foreground"
        >
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-marketing-accent"
      />
    </div>
  );
}

/** Students × price, minus our fee and the plan: what reaches the coach, a
 * month and a year. Fees and plan prices are the live ones from the API. */
export function EarningsCalculator({
  terms,
  currency,
}: {
  terms: Record<PaidPlan, PlanTerms>;
  currency: string;
}) {
  const locale = useLocale();
  const t = useTranslations("marketing.earnings");
  const [students, setStudents] = useState(40);
  const [price, setPrice] = useState(29);
  const [plan, setPlan] = useState<PaidPlan>("starter");
  const e = earnings(students, price, terms[plan]);
  // Totals round to whole units; `exact` shows a plan's price as pricing does ($19.90).
  const money = (n: number, exact = false) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: exact && !Number.isInteger(n) ? 2 : 0,
        maximumFractionDigits: exact ? 2 : 0,
      }).format(n);
    } catch {
      return `${Math.round(n)} ${currency}`;
    }
  };
  return (
    <div className="mx-auto grid max-w-text gap-5 px-6 md:grid-cols-2">
      <div className="space-y-8 rounded-tile bg-muted p-8">
        <Slider
          id="earn-students"
          label={t("students")}
          value={students}
          shown={String(students)}
          min={5}
          max={300}
          step={5}
          onChange={setStudents}
        />
        <Slider
          id="earn-price"
          label={t("price")}
          value={price}
          shown={money(price)}
          min={5}
          max={150}
          step={1}
          onChange={setPrice}
        />
        <fieldset>
          <legend className="text-body text-foreground">{t("plan")}</legend>
          <div className="mt-3 inline-flex rounded-full bg-background p-1">
            {PLANS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={plan === p}
                onClick={() => setPlan(p)}
                className={cn(
                  "rounded-full px-5 py-2 text-caption font-semibold transition-colors",
                  plan === p
                    ? "bg-marketing-accent text-marketing-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`plans.${p}`)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div
        aria-live="polite"
        className="flex flex-col justify-center rounded-tile border border-marketing-accent bg-[color-mix(in_oklch,var(--marketing-accent)_10%,var(--muted))] p-8"
      >
        <p className="text-caption text-muted-foreground">{t("keep")}</p>
        <p className="mt-2 text-display-2 tabular-nums text-marketing-accent">
          {money(e.keep)}
        </p>
        <p className="mt-1 text-body text-muted-foreground">
          {t("yearly", { amount: money(e.yearly) })}
        </p>
        <dl className="mt-6 space-y-2 text-body">
          {[
            [t("gross"), money(e.gross)],
            [t("fee", { pct: terms[plan].feePct }), `− ${money(e.fee)}`],
            [t("planCost"), `− ${money(e.planPrice, true)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="tabular-nums text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-caption text-muted-foreground">{t("note")}</p>
      </div>
    </div>
  );
}
