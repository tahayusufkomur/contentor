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
import { BOX, H2, LABEL, Opener, Section, WRAP, money, pad2 } from "./ui";

/** Pricing passes: membership tiers styled as backstage passes with bold rates, interval tags and box frames. */
export function PricingPasses({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul
            className={cn(
              "mt-12 grid gap-4",
              plans.length <= 3
                ? "md:grid-cols-[repeat(var(--encore-cols),minmax(0,1fr))]"
                : "md:grid-cols-2 lg:grid-cols-3",
            )}
            style={
              plans.length <= 3
                ? ({
                    "--encore-cols": Math.max(plans.length, 1),
                  } as CSSProperties)
                : undefined
            }
          >
            {plans.map((plan, i) => (
              <li key={plan.id} className={cn(BOX, "flex flex-col p-6 md:p-8")}>
                <div className={cn(LABEL, "flex items-center justify-between")}>
                  <span>Pass {pad2(i)}</span>
                  <span>
                    {billingIntervalSuffix(plan.billing_interval_months)}
                  </span>
                </div>

                <h3
                  className={cn(
                    H2,
                    "mt-5 text-[clamp(1.5rem,1.2rem+1.4vw,2.4rem)] leading-[0.98]",
                  )}
                >
                  {plan.name}
                </h3>

                <p className="encore-tnum mt-6 font-display text-[2.4rem] font-bold leading-none">
                  {money(plan.price, plan.currency)}
                </p>

                {!!plan.item_count && (
                  <p className={cn(LABEL, "mt-4 text-muted-foreground")}>
                    {plan.item_count} {plan.item_count === 1 ? "item" : "items"}
                  </p>
                )}

                {plan.description && (
                  <p className="mt-4 text-[0.95rem] leading-[1.6] text-muted-foreground">
                    {plan.description}
                  </p>
                )}

                <div className="mt-auto pt-8">
                  {plan.is_subscribed ? (
                    <p className="inline-flex min-h-12 w-full items-center justify-center border-[3px] border-foreground font-display text-[0.78rem] font-bold uppercase tracking-[0.04em]">
                      Subscribed
                    </p>
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      planName={plan.name}
                      price={plan.price}
                      currency={plan.currency}
                      intervalMonths={plan.billing_interval_months}
                      className="h-auto min-h-12 w-full whitespace-normal rounded-none px-6 py-3 font-display text-[0.78rem] font-bold uppercase tracking-[0.04em] shadow-none hover:bg-accent hover:text-accent-foreground [&_svg]:hidden"
                    />
                  )}

                  <SmartLink
                    href={`/plans/${plan.id}`}
                    className="encore-link mt-4 block w-fit text-[0.9rem] font-semibold"
                  >
                    See what&rsquo;s included
                  </SmartLink>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12">
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
