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
  CARD,
  H3,
  LABEL,
  Opener,
  Section,
  Stat,
  WRAP,
  money,
  pad2,
} from "./ui";

function Plan({ plan, i }: { plan: SubscriptionPlan; i: number }) {
  return (
    <li className={cn(CARD, "flex flex-col p-7")}>
      <p className={cn(LABEL, "text-primary")}>Permit {pad2(i)}</p>
      <h3 className={cn(H3, "mt-3 text-[1.5rem]")}>{plan.name}</h3>
      <div className="mt-5">
        <p className="trail-tnum font-display text-[2.6rem] font-bold leading-none">
          {money(plan.price, plan.currency)}
        </p>
        <p className={cn(LABEL, "mt-2 text-muted-foreground")}>
          {billingIntervalSuffix(plan.billing_interval_months)}
        </p>
      </div>
      {!!plan.item_count && (
        <Stat
          value={plan.item_count}
          label={plan.item_count === 1 ? "item included" : "items included"}
          className="mt-5"
        />
      )}
      {plan.description && (
        <p className="mt-4 max-w-[34ch] text-pretty text-[0.98rem] leading-[1.65] text-muted-foreground">
          {plan.description}
        </p>
      )}
      <div className="mt-auto pt-8">
        {plan.is_subscribed ? (
          <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border-2 border-foreground font-semibold">
            Subscribed
          </p>
        ) : (
          <SubscribeButton
            planId={plan.id}
            planName={plan.name}
            price={plan.price}
            currency={plan.currency}
            intervalMonths={plan.billing_interval_months}
            className="h-auto min-h-12 w-full whitespace-normal rounded-[var(--radius)] bg-accent px-6 py-3 text-[0.95rem] font-semibold text-accent-foreground shadow-none hover:bg-primary hover:text-primary-foreground [&_svg]:hidden"
          />
        )}
        <SmartLink
          href={`/plans/${plan.id}`}
          className="trail-link mt-4 block w-fit text-[0.9rem] font-semibold"
        >
          See what&rsquo;s included
        </SmartLink>
      </div>
    </li>
  );
}

/** Membership plans as trail permits: route cards with bold price, permit number, and orange pass button. */
export function PricingPermits({ block, data, editable }: SectionProps) {
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
              "mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-[repeat(var(--trail-cols),minmax(0,1fr))]",
              solo && "mx-auto max-w-[26rem] sm:grid-cols-1 lg:grid-cols-1",
            )}
            style={
              {
                "--trail-cols": solo ? 1 : plans.length,
              } as CSSProperties
            }
          >
            {plans.map((p, i) => (
              <Plan key={p.id} plan={p} i={i} />
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
