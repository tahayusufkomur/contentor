import type { CSSProperties } from "react";
import { formatMoneyParts } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
} from "../kit";
import type { SectionProps } from "../types";
import { HAIR, LABEL, NUM, Opener, RULE, Section, WRAP, str } from "./ui";
import { useLocale, useTranslations } from "next-intl";

/** Pricing as an annual report comparison table: CSS grid with row headers,
 *  lining tabular prices, hairlines, and square subscribe actions. */
export function PricingTable({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const locale = useLocale();
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  const alt = str(block.heading) || t("sectionLabel.pricing");
  const hasIncludes = plans.some((p) => Boolean(p.item_count));
  const hasAbout = plans.some((p) => Boolean(p.description));

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <>
            {/* Desktop Comparison Table */}
            <div
              className="mt-14 hidden border-b border-border md:grid md:grid-cols-[7rem_repeat(var(--ledger-cols),minmax(0,1fr))] md:gap-x-8 lg:gap-x-10"
              style={
                {
                  "--ledger-cols": Math.max(plans.length, 1),
                } as CSSProperties
              }
            >
              {/* Row: Plan Name */}
              <div className={cn(RULE, "py-5", LABEL, "ledger-dim")}>
                {t("table.plan")}
              </div>
              {plans.map((p) => (
                <div
                  key={`name-${p.id}`}
                  className={cn(
                    RULE,
                    "py-5 font-display text-[1.6rem] font-normal leading-tight",
                  )}
                >
                  {p.name}
                </div>
              ))}

              {/* Row: Price */}
              <div className={cn(HAIR, "py-6", LABEL, "ledger-dim")}>
                {t("table.price")}
              </div>
              {plans.map((p) => {
                const { symbol, amount } = formatMoneyParts(
                  p.price,
                  p.currency,
                  locale,
                );
                return (
                  <div key={`price-${p.id}`} className={cn(HAIR, "py-6")}>
                    <div className="flex items-baseline font-display font-light leading-none tracking-[-0.03em]">
                      <span className="mr-1 text-[1.4rem] text-muted-foreground">
                        {symbol}
                      </span>
                      <span
                        className={cn(
                          NUM,
                          "text-[clamp(3rem,2.2rem+2.6vw,4.5rem)]",
                        )}
                      >
                        {amount}
                      </span>
                      <span className="ml-2 text-[0.95rem] tracking-normal text-muted-foreground">
                        {billingIntervalSuffix(
                          p.billing_interval_months,
                          (k, v) => t(`plan.${k}`, v),
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Row: Includes */}
              {hasIncludes && (
                <>
                  <div className={cn(HAIR, "py-5", LABEL, "ledger-dim")}>
                    {t("plan.includes")}
                  </div>
                  {plans.map((p) => (
                    <div
                      key={`inc-${p.id}`}
                      className={cn(HAIR, "py-5 text-[0.95rem]", NUM)}
                    >
                      {p.item_count
                        ? t("plan.items", { count: p.item_count })
                        : "—"}
                    </div>
                  ))}
                </>
              )}

              {/* Row: About */}
              {hasAbout && (
                <>
                  <div className={cn(HAIR, "py-5", LABEL, "ledger-dim")}>
                    {t("plan.about")}
                  </div>
                  {plans.map((p) => (
                    <div
                      key={`desc-${p.id}`}
                      className={cn(
                        HAIR,
                        "max-w-[36ch] py-5 text-[0.95rem] leading-[1.6] text-muted-foreground",
                      )}
                    >
                      {p.description || "—"}
                    </div>
                  ))}
                </>
              )}

              {/* Row: Action */}
              <div className={cn(HAIR, "py-8")} />
              {plans.map((p) => (
                <div key={`action-${p.id}`} className={cn(HAIR, "py-8")}>
                  {p.is_subscribed ? (
                    <p className="inline-flex min-h-12 w-full items-center justify-center border border-foreground px-6 py-3 text-[0.95rem] font-medium">
                      {t("plan.subscribed")}
                    </p>
                  ) : (
                    <SubscribeButton
                      planId={p.id}
                      planName={p.name}
                      price={p.price}
                      currency={p.currency}
                      intervalMonths={p.billing_interval_months}
                      className="h-auto min-h-12 w-full whitespace-normal rounded-none px-6 py-3 text-[0.95rem] shadow-none hover:bg-accent [&_svg]:hidden"
                    />
                  )}
                  <SmartLink
                    href={`/plans/${p.id}`}
                    className="ledger-link mt-4 inline-block text-[0.9rem] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("plan.seeIncluded")}
                  </SmartLink>
                </div>
              ))}
            </div>

            {/* Mobile Stacked View */}
            <ul className="mt-12 border-t border-foreground md:hidden">
              {plans.map((p) => {
                const { symbol, amount } = formatMoneyParts(
                  p.price,
                  p.currency,
                  locale,
                );
                return (
                  <li key={p.id} className="border-b border-border py-8">
                    <h3 className="font-display text-[1.6rem] font-normal leading-tight">
                      {p.name}
                    </h3>
                    <div className="mt-4 flex items-baseline font-display font-light leading-none tracking-[-0.03em]">
                      <span className="mr-1 text-[1.3rem] text-muted-foreground">
                        {symbol}
                      </span>
                      <span className={cn(NUM, "text-[3rem]")}>{amount}</span>
                      <span className="ml-2 text-[0.9rem] tracking-normal text-muted-foreground">
                        {billingIntervalSuffix(
                          p.billing_interval_months,
                          (k, v) => t(`plan.${k}`, v),
                        )}
                      </span>
                    </div>

                    <dl className="mt-6 border-t border-border">
                      {!!p.item_count && (
                        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline border-b border-border py-3">
                          <dt className={cn(LABEL, "ledger-dim")}>
                            {t("plan.includes")}
                          </dt>
                          <dd className={cn(NUM, "text-[0.95rem]")}>
                            {t("plan.items", { count: p.item_count })}
                          </dd>
                        </div>
                      )}
                      {p.description && (
                        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline border-b border-border py-3">
                          <dt className={cn(LABEL, "ledger-dim")}>
                            {t("plan.about")}
                          </dt>
                          <dd className="text-[0.95rem] leading-[1.6] text-muted-foreground">
                            {p.description}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-8">
                      {p.is_subscribed ? (
                        <p className="inline-flex min-h-12 w-full items-center justify-center border border-foreground px-6 py-3 text-[0.95rem] font-medium">
                          {t("plan.subscribed")}
                        </p>
                      ) : (
                        <SubscribeButton
                          planId={p.id}
                          planName={p.name}
                          price={p.price}
                          currency={p.currency}
                          intervalMonths={p.billing_interval_months}
                          className="h-auto min-h-12 w-full whitespace-normal rounded-none px-6 py-3 text-[0.95rem] shadow-none hover:bg-accent [&_svg]:hidden"
                        />
                      )}
                      <SmartLink
                        href={`/plans/${p.id}`}
                        className="ledger-link mt-4 inline-block text-[0.9rem] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {t("plan.seeIncluded")}
                      </SmartLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="mt-14">
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
