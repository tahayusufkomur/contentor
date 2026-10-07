import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import { CARD, LABEL, Leader, Opener, Section, WRAP, money } from "./ui";

/** Membership plans presented as a trattoria prix-fixe menu with dotted price lines. */
export function PricingMenu({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {!plans.length ? (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No membership plans yet"
              text="Create a plan under Billing and it appears here."
            />
          </div>
        ) : (
          <div className={cn(CARD, "mx-auto mt-14 max-w-[56rem] p-7 md:p-10")}>
            <p className={LABEL}>Menu</p>
            <ul className="mt-4">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className="border-b-2 border-dotted border-border py-7 last:border-0"
                >
                  <Leader
                    label={
                      <span className="font-display text-[1.5rem]">
                        {plan.name}
                      </span>
                    }
                    value={
                      <span className="font-display text-[1.6rem] text-foreground">
                        {money(plan.price, plan.currency)}
                        <span className="ml-2 font-sans text-[0.9rem] text-muted-foreground">
                          {billingIntervalSuffix(plan.billing_interval_months)}
                        </span>
                      </span>
                    }
                  />
                  {plan.description && (
                    <p className="mt-3 max-w-[44ch] text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  {!!plan.item_count && (
                    <p className={cn(LABEL, "mt-3")}>
                      {plan.item_count}{" "}
                      {plan.item_count === 1 ? "item" : "items"} included
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center gap-5">
                    {plan.is_subscribed ? (
                      <p className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius)] border-2 border-primary px-6 font-bold text-primary">
                        Subscribed
                      </p>
                    ) : (
                      <SubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        price={plan.price}
                        currency={plan.currency}
                        intervalMonths={plan.billing_interval_months}
                        className="h-auto min-h-12 w-full whitespace-normal rounded-[var(--radius)] bg-accent px-6 py-3 text-[0.95rem] font-bold text-accent-foreground shadow-none hover:bg-primary sm:w-auto [&_svg]:hidden"
                      />
                    )}
                    <SmartLink
                      href={`/plans/${plan.id}`}
                      className="tavola-link text-[0.9rem] font-bold"
                    >
                      See what&rsquo;s included
                    </SmartLink>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
