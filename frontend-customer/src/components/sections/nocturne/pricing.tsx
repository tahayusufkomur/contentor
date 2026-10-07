import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import { CHIP, H3, Opener, Section, WRAP, money } from "./ui";

/** Membership plans as soft night cards with amber prices and pill actions. */
export function PricingStays({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;
  const solo = plans.length === 1;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul
            className={cn(
              "mx-auto mt-14 grid gap-6",
              solo
                ? "max-w-[26rem]"
                : "max-w-[64rem] sm:grid-cols-2 lg:grid-cols-[repeat(var(--nocturne-cols),minmax(0,1fr))]",
            )}
            style={
              { "--nocturne-cols": solo ? 1 : plans.length } as CSSProperties
            }
          >
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-col rounded-[var(--radius)] border border-border bg-muted p-8"
              >
                <h3 className={cn(H3, "text-[1.5rem] leading-snug")}>
                  {plan.name}
                </h3>
                <p className="mt-5 flex items-baseline">
                  <span className="nocturne-soft font-display text-[3rem] leading-none text-primary">
                    {money(plan.price, plan.currency)}
                  </span>
                  <span className="ml-2 text-[0.95rem] text-muted-foreground">
                    {billingIntervalSuffix(plan.billing_interval_months)}
                  </span>
                </p>
                {!!plan.item_count && (
                  <p className={cn(CHIP, "mt-5 self-start")}>
                    {plan.item_count} {plan.item_count === 1 ? "item" : "items"}{" "}
                    included
                  </p>
                )}
                {plan.description && (
                  <p className="mt-4 max-w-[34ch] text-[0.98rem] leading-[1.65] text-muted-foreground">
                    {plan.description}
                  </p>
                )}
                <div className="mt-auto pt-8">
                  {plan.is_subscribed ? (
                    <p className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-border text-[0.95rem] font-semibold">
                      Subscribed
                    </p>
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      planName={plan.name}
                      price={plan.price}
                      currency={plan.currency}
                      intervalMonths={plan.billing_interval_months}
                      className="h-auto min-h-12 w-full whitespace-normal rounded-full px-7 py-3 text-[0.95rem] font-semibold shadow-none [&_svg]:hidden"
                    />
                  )}
                  <SmartLink
                    href={`/plans/${plan.id}`}
                    className="nocturne-link mt-4 block w-fit text-[0.9rem]"
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
