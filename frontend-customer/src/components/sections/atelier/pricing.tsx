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
  Diamond,
  Divider,
  H3,
  LABEL,
  Opener,
  Section,
  WRAP,
  money,
  str,
} from "./ui";

/** Membership and tiered packages presented as a refined atelier treatment menu. */
export function PricingMenu({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section label={str(block.heading) || "Membership"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} align="center" />

        {plans.length ? (
          <div className="mx-auto mt-14 max-w-3xl rounded-3xl border border-[color-mix(in_oklch,var(--border)_80%,transparent)] bg-card p-6 shadow-sm sm:p-10 lg:p-12">
            <ul className="space-y-10">
              {plans.map((plan, index) => (
                <li key={plan.id}>
                  {index > 0 && <Divider className="mb-10" />}
                  <div className="grid gap-y-6 md:grid-cols-12 md:items-center md:gap-x-8">
                    <div className="md:col-span-7">
                      <div className="flex items-center gap-2">
                        <Diamond />
                        <h3
                          className={cn(
                            H3,
                            "text-[1.4rem] leading-snug md:text-[1.6rem]",
                          )}
                        >
                          {plan.name}
                        </h3>
                      </div>
                      {plan.description && (
                        <p className="mt-2 max-w-[38ch] text-pretty text-[0.95rem] leading-[1.65] text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                      {!!plan.item_count && (
                        <p className={cn(LABEL, "mt-3 text-muted-foreground")}>
                          {plan.item_count}{" "}
                          {plan.item_count === 1 ? "treatment" : "treatments"}{" "}
                          included
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col md:col-span-5 md:items-end md:text-right">
                      <p className="flex items-baseline md:justify-end">
                        <span className="font-display text-[2.25rem] font-medium leading-none sm:text-[2.6rem]">
                          {money(plan.price, plan.currency)}
                        </span>
                        <span className="ml-2 text-[0.9rem] text-muted-foreground">
                          {billingIntervalSuffix(plan.billing_interval_months)}
                        </span>
                      </p>

                      <div className="mt-5 w-full sm:max-w-xs">
                        {plan.is_subscribed ? (
                          <p className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-primary text-[0.92rem] font-medium text-primary">
                            Subscribed
                          </p>
                        ) : (
                          <SubscribeButton
                            planId={plan.id}
                            planName={plan.name}
                            price={plan.price}
                            currency={plan.currency}
                            intervalMonths={plan.billing_interval_months}
                            className="h-auto min-h-12 w-full whitespace-normal rounded-full bg-primary px-7 py-3 text-[0.92rem] font-medium text-primary-foreground shadow-none transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-md [&_svg]:hidden"
                          />
                        )}
                        <SmartLink
                          href={`/plans/${plan.id}`}
                          className="atelier-link mt-3 block text-center text-[0.85rem] font-medium text-muted-foreground hover:text-foreground md:text-right"
                        >
                          See details
                        </SmartLink>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title="No membership plans yet"
              text="Create a plan under Billing and it appears here in the menu."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
