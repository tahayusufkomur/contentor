import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import { EmptyHint, SmartLink, SubscribeButton, Txt, billingIntervalSuffix } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, Section, WRAP } from "./ui";

/** "29.00" EUR → { symbol: "€", amount: "29" }; falls back to the raw code. */
function money(price: string, currency: string) {
  const value = Number(price);
  if (!Number.isFinite(value)) return { symbol: currency, amount: price };
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: value % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    }).formatToParts(value);
    return {
      symbol: parts.find((p) => p.type === "currency")?.value ?? currency,
      amount: parts.filter((p) => p.type !== "currency" && p.type !== "literal").map((p) => p.value).join(""),
    };
  } catch {
    return { symbol: currency, amount: price };
  }
}

function Plan({ plan, solo }: { plan: SubscriptionPlan; solo: boolean }) {
  const { symbol, amount } = money(plan.price, plan.currency);
  return (
    <li
      className={cn(
        "flex flex-col border-t border-border py-10 first:border-t-0 md:border-l md:border-t-0 md:px-8 md:first:border-l-0 md:first:pl-0 lg:px-10 lg:py-12",
        solo && "md:grid md:grid-cols-12 md:items-end md:gap-x-10 md:px-0",
      )}
    >
      <div className={cn(solo && "md:col-span-7")}>
        <h3 className="font-display text-[1.75rem] font-normal italic leading-tight">{plan.name}</h3>
        <p className="journal-lnum mt-6 flex items-start font-display font-light leading-none tracking-[-0.03em]">
          <span className="mr-1 mt-[0.35em] text-[1.6rem] text-muted-foreground">{symbol}</span>
          <span className="text-[clamp(4rem,2.6rem+4vw,6rem)]">{amount}</span>
          <span className="ml-2 self-end pb-[0.4em] text-[1rem] tracking-normal text-muted-foreground">
            {billingIntervalSuffix(plan.billing_interval_months)}
          </span>
        </p>
        {!!plan.item_count && (
          <p className={cn(LABEL, "mt-6 text-foreground")}>
            {plan.item_count} {plan.item_count === 1 ? "item" : "items"} included
          </p>
        )}
        {plan.description && (
          <p className="mt-4 max-w-[34ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground">
            {plan.description}
          </p>
        )}
      </div>
      <div className={cn("mt-auto pt-10", solo && "md:col-span-5 md:pt-0")}>
        {plan.is_subscribed ? (
          <p className="inline-flex min-h-12 items-center rounded-full border border-border px-7 text-[0.95rem] font-medium">
            Subscribed
          </p>
        ) : (
          <SubscribeButton
            planId={plan.id}
            planName={plan.name}
            price={plan.price}
            currency={plan.currency}
            intervalMonths={plan.billing_interval_months}
            className="h-auto min-h-12 w-full whitespace-normal rounded-full sm:w-auto px-7 py-3 text-[0.95rem] shadow-none hover:bg-accent [&_svg]:hidden"
          />
        )}
        <SmartLink
          href={`/plans/${plan.id}`}
          className="journal-link mt-5 block w-fit text-[0.9rem] font-medium text-muted-foreground hover:text-foreground"
        >
          See what&rsquo;s included
        </SmartLink>
      </div>
    </li>
  );
}

/** Plans as ruled columns of type: italic name, a big light price, one action
 *  each. No badges, no invented "most popular". */
export function PricingColumns({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;
  const solo = plans.length === 1;

  return (
    <Section label={typeof block.heading === "string" ? block.heading : "Pricing"}>
      <div className={WRAP}>
        <div className="grid gap-y-8 lg:grid-cols-12 lg:gap-x-10">
          <div className="lg:col-span-7">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-5 block max-w-[18ch]")}
            />
          </div>
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            placeholder="Intro"
            className="block max-w-[44ch] self-end text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground lg:col-span-4 lg:col-start-9"
          />
        </div>

        {plans.length ? (
          <ul
            className="mt-14 grid border-y border-foreground md:mt-20 md:grid-cols-[repeat(var(--journal-cols),minmax(0,1fr))]"
            style={{ "--journal-cols": solo ? 1 : plans.length } as CSSProperties}
          >
            {plans.map((p) => (
              <Plan key={p.id} plan={p} solo={solo} />
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
