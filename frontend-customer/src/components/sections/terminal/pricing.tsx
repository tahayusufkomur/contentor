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
import { Flag, H3, Opener, Section, WindowChrome, WRAP, money } from "./ui";

/** Membership subscription plans presented as machine config manifests. */
export function PricingPlans({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;
  const solo = plans.length === 1;

  return (
    <Section
      tone="console"
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul
            className={cn(
              "mx-auto mt-14 grid gap-6",
              solo
                ? "max-w-[28rem]"
                : "max-w-[76rem] sm:grid-cols-2 lg:grid-cols-[repeat(var(--terminal-cols),minmax(0,1fr))]",
            )}
            style={
              { "--terminal-cols": solo ? 1 : plans.length } as CSSProperties
            }
          >
            {plans.map((plan, i) => {
              const isRecommended =
                plans.length >= 3
                  ? i === 1
                  : plan.billing_interval_months === 12;

              return (
                <li key={plan.id} className="flex flex-col">
                  <WindowChrome
                    title={`tier_${plan.name.toLowerCase().replace(/\s+/g, "_")}.conf`}
                    tag={isRecommended ? "STARRED" : "ENV"}
                    className={cn(
                      "flex flex-1 flex-col h-full",
                      isRecommended && "border-accent ring-1 ring-accent/50",
                    )}
                    bodyClassName="flex flex-1 flex-col justify-between p-6 sm:p-8"
                  >
                    <div>
                      {isRecommended && (
                        <div className="mb-4">
                          <Flag className="border-accent text-accent">
                            --recommended
                          </Flag>
                        </div>
                      )}

                      <h3
                        className={cn(
                          H3,
                          "text-[1.35rem] leading-snug font-mono text-foreground",
                        )}
                      >
                        {plan.name}
                      </h3>

                      <div className="mt-5 flex items-baseline">
                        <span className="font-display text-[2.5rem] font-bold leading-none text-foreground sm:text-[2.8rem]">
                          {money(plan.price, plan.currency)}
                        </span>
                        <span className="ml-2 font-mono text-sm text-muted-foreground">
                          {billingIntervalSuffix(plan.billing_interval_months)}
                        </span>
                      </div>

                      {!!plan.item_count && (
                        <p className="mt-4 font-mono text-xs font-semibold text-primary">
                          --includes {plan.item_count}{" "}
                          {plan.item_count === 1 ? "item" : "items"}
                        </p>
                      )}

                      {plan.description && (
                        <p className="mt-4 max-w-[34ch] text-[0.98rem] leading-[1.65] text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-border/60">
                      {plan.is_subscribed ? (
                        <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border-2 border-primary font-mono text-[0.95rem] font-bold text-primary">
                          Subscribed [ACTIVE]
                        </p>
                      ) : (
                        <SubscribeButton
                          planId={plan.id}
                          planName={plan.name}
                          price={plan.price}
                          currency={plan.currency}
                          intervalMonths={plan.billing_interval_months}
                          className="terminal-btn-hover h-auto min-h-12 w-full whitespace-normal rounded-[var(--radius)] bg-primary px-6 py-3 font-mono text-[0.95rem] font-bold text-primary-foreground shadow-none hover:bg-accent hover:text-accent-foreground [&_svg]:hidden"
                        />
                      )}

                      <SmartLink
                        href={`/plans/${plan.id}`}
                        className="terminal-link mt-4 block w-fit font-mono text-[0.85rem] font-semibold"
                      >
                        [ Inspect details -&gt; ]
                      </SmartLink>
                    </div>
                  </WindowChrome>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No membership plans yet"
              text="Create a plan under Billing and it appears in the manifest automatically."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
