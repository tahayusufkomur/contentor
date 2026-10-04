import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import { EmptyHint, SubscribeButton, Txt, billingIntervalSuffix } from "../kit";
import type { SectionProps } from "../types";
import { FILL, Kicker, PopSection, WRAP } from "./ui";

const CARD: (keyof typeof FILL)[] = ["lime", "pink", "sun"];
const TILT = ["-rotate-1", "rotate-1", "-rotate-[0.5deg]"];

function money(price: string, currency: string) {
  const n = Number(price);
  if (!Number.isFinite(n)) return `${price} ${currency}`;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${price} ${currency}`;
  }
}

/** Each plan its own colour card with a giant price. */
export function PricingColorcards({ block, data, editable }: SectionProps) {
  const plans = Array.isArray(data) ? (data as SubscriptionPlan[]) : [];
  if (!plans.length && !editable) return null;
  const cols =
    plans.length >= 3 ? "md:grid-cols-2 lg:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2 max-w-4xl" : "max-w-md";
  return (
    <PopSection bg="var(--card)" className="py-20 md:py-28">
      <div className={WRAP}>
        <div className="mx-auto max-w-4xl text-center">
          <Kicker block={block} editable={editable} fill="paper" className="mx-auto" />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className="pop-display pop-h2 mt-6"
            placeholder="Heading"
          />
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            className="pop-lede mx-auto mt-6 max-w-[36rem] text-muted-foreground"
          />
        </div>

        {plans.length === 0 ? (
          <div className="mt-12">
            <EmptyHint editable={editable} title="No plans yet" text="Create a membership plan and it shows up here." />
          </div>
        ) : (
          <ul className={cn("mx-auto mt-14 grid gap-8 md:mt-16 lg:gap-10", cols)}>
            {plans.map((p, i) => (
              <li
                key={p.id}
                className={cn(
                  "pop-card flex flex-col p-7 md:p-9",
                  FILL[CARD[i % CARD.length]],
                  TILT[i % TILT.length],
                )}
              >
                <h3 className="pop-kicker bg-[var(--pop-paper)] !text-[0.875rem]">{p.name}</h3>
                <p className="mt-8 flex flex-wrap items-baseline gap-x-2">
                  <span className="pop-display text-[clamp(3.75rem,2.5rem+3vw,5.5rem)] !leading-[0.85]">
                    {money(p.price, p.currency)}
                  </span>
                  <span className="pop-mono text-base text-muted-foreground">
                    {billingIntervalSuffix(p.billing_interval_months)}
                  </span>
                </p>
                {p.description && <p className="mt-6 flex-1 text-base leading-relaxed">{p.description}</p>}
                <SubscribeButton
                  planId={p.id}
                  planName={p.name}
                  price={p.price}
                  currency={p.currency}
                  intervalMonths={p.billing_interval_months}
                  label="Subscribe"
                  className="mt-8 h-auto min-h-[3.25rem] w-full whitespace-normal rounded-full border-2 border-[color:var(--foreground)] bg-[var(--foreground)] px-6 text-base font-semibold text-[color:var(--background)] shadow-[4px_4px_0_var(--primary)] hover:bg-[var(--foreground)]"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PopSection>
  );
}
