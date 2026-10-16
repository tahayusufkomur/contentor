"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Mara's real catalogue (seed_footage_coach): her courses and membership at
 * their seeded prices, bought by made-up students. */
const SALES = [
  { name: "Anna K.", item: "Hips & Hamstrings in 4 Weeks", amount: 49 },
  { name: "Jonas B.", item: "Studio membership", amount: 29 },
  { name: "Priya S.", item: "A Kinder Back", amount: 59 },
  { name: "Elif Y.", item: "Studio membership, yearly", amount: 290 },
  { name: "Marco R.", item: "Slow Flow for Better Sleep", amount: 39 },
  { name: "Hana T.", item: "Studio membership", amount: 29 },
  { name: "Sofia L.", item: "Shoulders & Neck for Screen Days", amount: 29 },
  { name: "Daniel O.", item: "A Kinder Back", amount: 59 },
];
/** Rendered rows: four in view, the fifth sliding out under the fade. */
const ROWS = 5;
const MINUTES_AGO = [0, 2, 6, 11, 19];
/** What came in earlier today, before the first row on screen. */
const EARLIER_TODAY = 1180;
const EVERY_MS = 2800;

const amountOf = (k: number) => SALES[k % SALES.length].amount;

/** "Get paid directly", drawn: Stripe payment notifications landing one
 * after another, today's total climbing above them. Illustrative amounts;
 * the arrival is a CSS animation and reduced motion keeps the stack still. */
export function PaymentFeed({
  label,
  currency,
}: {
  label: string;
  currency: string;
}) {
  const t = useTranslations("marketing.team.roles.cashier.scene");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((n) => n + 1), EVERY_MS);
    return () => clearInterval(id);
  }, []);

  const newest = tick + ROWS - 1;
  let total = EARLIER_TODAY;
  for (let k = 0; k <= newest; k++) total += amountOf(k);
  const money = (n: number, cents = true) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: cents ? 2 : 0,
        maximumFractionDigits: cents ? 2 : 0,
      }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  };

  return (
    <figure
      role="img"
      aria-label={label}
      className="mx-auto w-full max-w-[400px]"
    >
      <div aria-hidden className="text-center">
        <p className="text-caption font-medium text-muted-foreground">
          {t("today")}
        </p>
        <p
          key={total}
          className="mt-1 text-[clamp(2.5rem,6vw,3.5rem)] font-semibold leading-none tracking-tight tabular-nums text-foreground motion-safe:animate-scale-in"
        >
          {money(total, false)}
        </p>
      </div>
      <ol
        aria-hidden
        className="mt-8 h-[330px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_72%,transparent)]"
      >
        {Array.from({ length: ROWS }, (_, i) => newest - i).map((k, i) => {
          const sale = SALES[k % SALES.length];
          return (
            <li key={k} className={cn(k >= ROWS && "feed-in")}>
              <div className="pb-2.5">
                <div className="flex items-center gap-3 rounded-[18px] bg-card/80 p-3 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[#635bff] text-lg font-bold text-white">
                    S
                  </span>
                  <div className="min-w-0 flex-1 text-sm leading-snug">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {t("received")}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {i === 0
                          ? t("now")
                          : t("ago", { minutes: MINUTES_AGO[i] })}
                      </span>
                    </div>
                    <p className="truncate text-muted-foreground">
                      <span className="font-medium tabular-nums text-foreground">
                        {money(sale.amount)}
                      </span>{" "}
                      {t("from", { name: sale.name, item: sale.item })}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
