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
import {
  H3,
  HandArrow,
  Opener,
  PriceTag,
  Section,
  WRAP,
  WashiTape,
  money,
} from "./ui";

/** Workshop kit boxes with dashed seams, washi tape labels, and display pricing. */
export function PricingKits({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;
  const solo = plans.length === 1;

  return (
    <Section
      tone="kraft"
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul
            className={cn(
              "mx-auto mt-14 grid gap-8",
              solo
                ? "max-w-[26rem]"
                : "max-w-[68rem] sm:grid-cols-2 lg:grid-cols-[repeat(var(--workshop-cols),minmax(0,1fr))]",
            )}
            style={
              {
                "--workshop-cols": solo ? 1 : plans.length,
              } as CSSProperties
            }
          >
            {plans.map((plan, idx) => (
              <li
                key={plan.id}
                className="workshop-seam relative flex flex-col rounded-[var(--radius)] border-2 border-dashed border-border bg-card p-8 shadow-xs"
              >
                {idx === 0 && (
                  <WashiTape
                    tone="accent"
                    className="-top-3 left-8 rotate-[-2deg]"
                  />
                )}

                <div className="flex items-center justify-between gap-3 border-b border-dashed border-border pb-4">
                  <h3 className={cn(H3, "text-[1.5rem] leading-snug")}>
                    {plan.name}
                  </h3>
                  <span className="workshop-hand text-[1.1rem] font-bold text-accent">
                    Kit #{idx + 1}
                  </span>
                </div>

                <div className="mt-6 flex items-baseline">
                  <span className="font-display text-[2.8rem] font-bold leading-none text-foreground">
                    {money(plan.price, plan.currency)}
                  </span>
                  <span className="ml-2 text-[0.95rem] text-muted-foreground">
                    {billingIntervalSuffix(plan.billing_interval_months)}
                  </span>
                </div>

                {!!plan.item_count && (
                  <div className="mt-4">
                    <PriceTag
                      price={`${plan.item_count} ${
                        plan.item_count === 1 ? "project" : "projects"
                      } included`}
                    />
                  </div>
                )}

                {plan.description && (
                  <p className="mt-5 max-w-[34ch] text-pretty text-[0.98rem] leading-[1.65] text-muted-foreground">
                    {plan.description}
                  </p>
                )}

                <div className="mt-auto pt-8">
                  {plan.is_subscribed ? (
                    <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-primary font-bold text-primary">
                      Subscribed
                    </p>
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      planName={plan.name}
                      price={plan.price}
                      currency={plan.currency}
                      intervalMonths={plan.billing_interval_months}
                      className="workshop-focus inline-flex h-auto min-h-12 w-full whitespace-normal items-center justify-center rounded-[var(--radius)] bg-primary px-6 py-3 text-[1rem] font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:shadow-md border border-dashed border-[color-mix(in_oklch,var(--primary-foreground)_40%,transparent)] [&_svg]:hidden"
                    />
                  )}
                  <SmartLink
                    href={`/plans/${plan.id}`}
                    className="group workshop-link mt-4 inline-flex items-center gap-1.5 text-[0.92rem] font-bold"
                  >
                    <span>See all kit materials</span>
                    <HandArrow className="h-3 w-4" />
                  </SmartLink>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No membership kits yet"
              text="Create a plan under Billing and it appears here as a workshop kit."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
