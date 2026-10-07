import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import { H3, LABEL, Opener, Section, WRAP, money, str } from "./ui";

/** Term fees and membership tiers set out as structured ledger rows. */
export function PricingTermFees({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul className="mt-14 border-t-2 border-primary">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="grid gap-y-4 border-b border-border py-8 lg:grid-cols-12 lg:gap-x-10"
              >
                <div className="lg:col-span-4">
                  <h3 className={cn(H3, "text-[1.5rem] leading-tight")}>
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="mt-2 max-w-[34ch] text-pretty text-[0.98rem] leading-[1.65] text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </div>
                <div className="lg:col-span-3">
                  <p className="flex items-baseline">
                    <span className="font-display text-[2.4rem] font-semibold leading-none">
                      {money(plan.price, plan.currency)}
                    </span>
                    <span className="ml-2 text-[0.95rem] text-muted-foreground">
                      {billingIntervalSuffix(plan.billing_interval_months)}
                    </span>
                  </p>
                </div>
                <div className="lg:col-span-2">
                  {!!plan.item_count && (
                    <p className={cn(LABEL, "text-primary")}>
                      {plan.item_count}{" "}
                      {plan.item_count === 1 ? "item" : "items"}
                    </p>
                  )}
                </div>
                <div className="lg:col-span-3">
                  {plan.is_subscribed ? (
                    <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border-2 border-primary font-bold text-primary">
                      Subscribed
                    </p>
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      planName={plan.name}
                      price={plan.price}
                      currency={plan.currency}
                      intervalMonths={plan.billing_interval_months}
                      className="h-auto min-h-12 w-full whitespace-normal rounded-[var(--radius)] px-6 py-3 text-[0.95rem] font-bold shadow-none hover:bg-accent [&_svg]:hidden"
                    />
                  )}
                  <SmartLink
                    href={`/plans/${plan.id}`}
                    className="primer-link mt-4 block w-fit text-[0.9rem] font-bold"
                  >
                    See what&rsquo;s included
                  </SmartLink>
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
