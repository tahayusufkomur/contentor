import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import {
  DoubleRule,
  H3,
  Opener,
  RunningHead,
  Section,
  WRAP,
  money,
} from "./ui";

/** Membership tiers set out as a formal subscription order form with
 *  double-ruled borders, hollow radio seals, and typographic prices. */
export function PricingSubscriptions({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      tone="surface"
      label={
        typeof block.heading === "string" ? block.heading : "Subscriptions"
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <div className="manuscript-frame mx-auto mt-12 max-w-[56rem] bg-background p-6 sm:p-10 md:p-12">
            <RunningHead>Order of Subscription</RunningHead>
            <DoubleRule className="my-6" />

            <ul className="divide-y divide-border">
              {plans.map((plan) => (
                <li key={plan.id} className="py-7 first:pt-2 last:pb-2">
                  <div className="grid gap-y-5 lg:grid-cols-12 lg:items-center lg:gap-x-8">
                    {/* Plan Info */}
                    <div className="lg:col-span-5">
                      <div className="flex items-start gap-3.5">
                        <span
                          className="mt-1 size-5 shrink-0 rounded-full border-2 border-foreground"
                          aria-hidden="true"
                        />
                        <div>
                          <h3
                            className={cn(
                              H3,
                              "text-[1.35rem] font-normal leading-snug text-foreground",
                            )}
                          >
                            {plan.name}
                          </h3>
                          {plan.description && (
                            <p className="mt-2 max-w-[38ch] text-pretty text-[0.95rem] leading-[1.65] text-muted-foreground">
                              {plan.description}
                            </p>
                          )}
                          {!!plan.item_count && (
                            <p className="manuscript-small-caps mt-2.5 text-xs font-semibold text-accent">
                              {plan.item_count}{" "}
                              {plan.item_count === 1 ? "volume" : "volumes"}{" "}
                              included
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="lg:col-span-3 lg:text-right">
                      <div className="flex items-baseline lg:justify-end">
                        <span className="font-display text-[2.2rem] font-light leading-none text-foreground">
                          {money(plan.price, plan.currency)}
                        </span>
                        <span className="ml-2 font-display text-[0.95rem] italic text-muted-foreground">
                          {billingIntervalSuffix(plan.billing_interval_months)}
                        </span>
                      </div>
                    </div>

                    {/* Button & Link */}
                    <div className="lg:col-span-4 lg:text-right">
                      {plan.is_subscribed ? (
                        <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-primary text-[0.92rem] font-medium text-primary">
                          Subscribed
                        </p>
                      ) : (
                        <SubscribeButton
                          planId={plan.id}
                          planName={plan.name}
                          price={plan.price}
                          currency={plan.currency}
                          intervalMonths={plan.billing_interval_months}
                          className="h-auto min-h-12 w-full whitespace-normal rounded-[var(--radius)] bg-primary px-6 py-3 text-[0.92rem] font-medium text-primary-foreground shadow-none transition-colors duration-300 hover:bg-accent hover:text-accent-foreground sm:w-auto [&_svg]:hidden"
                        />
                      )}
                      <SmartLink
                        href={`/plans/${plan.id}`}
                        className="manuscript-link mt-3 inline-block text-[0.88rem] font-medium"
                      >
                        See subscription terms
                      </SmartLink>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <DoubleRule className="my-6" />
          </div>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No subscription plans yet"
              text="Create a membership plan under Billing and it appears here automatically."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
