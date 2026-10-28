import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import { H3, LABEL, LINK, Opener, Plate, Section, WRAP, pad2 } from "./ui";
import { useLocale, useTranslations } from "next-intl";

/** Membership plans presented as numbered editions on a ruled gallery wall. */
export function PricingEditions({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const locale = useLocale();
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      label={
        typeof block.heading === "string"
          ? block.heading
          : t("sectionLabel.pricing")
      }
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <ul className="mt-14 border-b border-border border-t border-foreground md:mt-20">
            {plans.map((plan, i) => (
              <li
                key={plan.id}
                className="grid gap-y-6 border-t border-border py-10 first:border-t-0 lg:grid-cols-12 lg:gap-x-10"
              >
                <div className="lg:col-span-2">
                  <Plate>{pad2(i)}</Plate>
                </div>
                <div className="lg:col-span-5">
                  <h3 className={cn(H3, "text-[1.5rem] leading-[1.2]")}>
                    {plan.name}
                  </h3>
                  {plan.description && (
                    <p className="mt-3 max-w-[34ch] text-pretty text-[0.95rem] leading-[1.65] text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  {Boolean(plan.item_count) && (
                    <p className={cn(LABEL, "mt-4 text-muted-foreground")}>
                      {t("plan.itemsIncluded", { count: plan.item_count ?? 0 })}
                    </p>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <p className="font-display text-[2.2rem] font-bold leading-none tracking-[-0.02em]">
                    {formatMoney(plan.price, plan.currency, locale)}
                  </p>
                  <p className={cn(LABEL, "mt-2 text-muted-foreground")}>
                    {billingIntervalSuffix(plan.billing_interval_months)}
                  </p>
                </div>
                <div className="flex flex-col items-start lg:col-span-3 lg:items-end lg:justify-self-end lg:text-right">
                  {plan.is_subscribed ? (
                    <p className="darkroom-mono inline-flex min-h-12 items-center border border-foreground px-5 text-[0.75rem] uppercase tracking-[0.1em]">
                      {t("plan.subscribed")}
                    </p>
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      planName={plan.name}
                      price={plan.price}
                      currency={plan.currency}
                      intervalMonths={plan.billing_interval_months}
                      className="h-auto min-h-12 w-full whitespace-normal rounded-none px-6 py-3 text-[0.9rem] shadow-none hover:bg-accent sm:w-auto [&_svg]:hidden"
                    />
                  )}
                  <SmartLink
                    href={`/plans/${plan.id}`}
                    className={cn(LINK, "mt-4")}
                  >
                    {t("plan.whatsIncluded")}
                  </SmartLink>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-14 md:mt-20">
            <EmptyHint
              editable={editable}
              title={t("empty.plans.title")}
              text={t("empty.plans.text")}
            />
          </div>
        )}
      </div>
    </Section>
  );
}
