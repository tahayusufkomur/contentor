import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import { BeltStripe, H3, LABEL, Opener, Section, WRAP, money } from "./ui";

/** Dojo dues and membership plans formatted as a ruled registry table. */
export function PricingDues({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      label={
        typeof block.heading === "string" ? block.heading : "Membership Dues"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul className="mt-14 border-t-2 border-primary">
            {plans.map((plan, i) => (
              <li
                key={plan.id}
                className="relative grid gap-y-6 border-b border-border py-8 lg:grid-cols-12 lg:items-center lg:gap-x-8"
              >
                <div className="lg:col-span-5">
                  <div className="flex items-center gap-3">
                    <BeltStripe index={i} className="h-1 w-6" />
                    <span className={cn(LABEL, "text-accent")}>
                      Tier {i + 1}
                    </span>
                  </div>
                  <h3
                    className={cn(
                      H3,
                      "mt-2 text-[1.45rem] font-extrabold leading-tight text-foreground",
                    )}
                  >
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="mt-2 max-w-[36ch] text-[0.95rem] leading-[1.65] text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </div>

                <div className="lg:col-span-3">
                  {!!plan.item_count && (
                    <p className="inline-flex items-center gap-2 text-[0.85rem] font-semibold text-foreground">
                      <span className="size-1.5 rounded-full bg-accent" />
                      <span>
                        {plan.item_count}{" "}
                        {plan.item_count === 1
                          ? "course & session"
                          : "courses & sessions"}
                      </span>
                    </p>
                  )}
                </div>

                <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-4">
                  <p className="flex items-baseline">
                    <span className="font-display text-[2.4rem] font-extrabold leading-none text-foreground">
                      {money(plan.price, plan.currency)}
                    </span>
                    <span className="ml-2 text-[0.92rem] text-muted-foreground">
                      {billingIntervalSuffix(plan.billing_interval_months)}
                    </span>
                  </p>

                  <div className="w-full sm:w-auto lg:w-full max-w-xs">
                    {plan.is_subscribed ? (
                      <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-primary font-bold text-[0.9rem] tracking-[0.04em] text-primary">
                        Active Membership
                      </p>
                    ) : (
                      <SubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        price={plan.price}
                        currency={plan.currency}
                        intervalMonths={plan.billing_interval_months}
                        className="h-auto min-h-12 w-full rounded-[var(--radius)] bg-primary px-7 py-3 text-[0.9rem] font-bold tracking-[0.04em] text-primary-foreground shadow-none hover:bg-accent hover:text-accent-foreground [&_svg]:hidden"
                      />
                    )}
                    <SmartLink
                      href={`/plans/${plan.id}`}
                      className="dojo-link mt-3 block text-center lg:text-right text-[0.85rem] font-semibold text-muted-foreground"
                    >
                      Dues policy & inclusions
                    </SmartLink>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No membership plans yet"
              text="Create a plan under Billing and it appears here."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
