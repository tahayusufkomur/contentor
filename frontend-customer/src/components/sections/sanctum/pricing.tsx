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
import { H3, LABEL, Opener, Section, StarGlyph, WRAP, str } from "./ui";
import { useLocale, useTranslations } from "next-intl";

/** Pricing "offerings": Stacked arch-topped sanctuary offering tiers with a glow on the middle tier (a glow, no label: no plan is flagged popular). */
export function PricingOfferings({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const locale = useLocale();
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      tone="surface"
      label={str(block.heading) || t("sanctum.sanctuaryOfferings")}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {plans.length ? (
          <div className="mt-14 grid gap-8 sm:grid-cols-2 md:mt-16 lg:grid-cols-3">
            {plans.map((plan, i) => {
              const isHighlight = i === 1 || (plans.length === 1 && i === 0);

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col justify-between overflow-hidden rounded-t-[2.5rem] rounded-b-[var(--radius)] border bg-[color-mix(in_oklch,var(--background)_85%,transparent)] p-8 text-center transition-all duration-300 md:p-10",
                    isHighlight
                      ? "border-primary sanctum-glow"
                      : "border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]",
                  )}
                >
                  {/* Top Arch Halo */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]"
                  />

                  <div className="relative z-10">
                    <h3
                      className={cn(
                        H3,
                        "text-[1.35rem] leading-tight md:text-[1.5rem]",
                      )}
                    >
                      {plan.name}
                    </h3>

                    {plan.description && (
                      <p className="mt-3 text-pretty text-[0.95rem] leading-[1.65] text-muted-foreground">
                        {plan.description}
                      </p>
                    )}

                    <div className="mt-8 border-y border-[color-mix(in_oklch,var(--primary)_20%,transparent)] py-6">
                      <p className="flex items-baseline justify-center">
                        <span className="font-display text-[2.6rem] font-medium leading-none text-primary">
                          {formatMoney(plan.price, plan.currency, locale)}
                        </span>
                        <span className="ml-2 text-[0.9rem] uppercase tracking-[0.1em] text-muted-foreground">
                          {billingIntervalSuffix(
                            plan.billing_interval_months,
                            (k, v) => t(`plan.${k}`, v),
                          )}
                        </span>
                      </p>
                    </div>

                    {!!plan.item_count && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <StarGlyph className="size-2 text-primary" />
                        <span className={cn(LABEL, "text-[0.78rem]")}>
                          {t("sanctum.offeringsIncluded", {
                            count: plan.item_count,
                          })}
                        </span>
                        <StarGlyph className="size-2 text-primary" />
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 mt-8">
                    {plan.is_subscribed ? (
                      <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border-2 border-primary font-display text-[0.82rem] font-medium uppercase tracking-[0.14em] text-primary">
                        {t("sanctum.initiated")}
                      </p>
                    ) : (
                      <SubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        price={plan.price}
                        currency={plan.currency}
                        intervalMonths={plan.billing_interval_months}
                        className={cn(
                          "sanctum-focus h-auto min-h-12 w-full rounded-[var(--radius)] px-6 py-3 font-display text-[0.82rem] font-medium uppercase tracking-[0.14em] shadow-none transition-transform duration-300 motion-safe:hover:-translate-y-0.5 [&_svg]:hidden",
                          isHighlight
                            ? "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary)_85%,var(--foreground))]"
                            : "border border-primary text-primary hover:bg-[color-mix(in_oklch,var(--primary)_15%,transparent)]",
                        )}
                      />
                    )}

                    <SmartLink
                      href={`/plans/${plan.id}`}
                      className="sanctum-link mt-4 inline-block font-display text-[0.8rem] uppercase tracking-[0.14em]"
                    >
                      {t("sanctum.sacredPrivileges")}
                    </SmartLink>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title={t("sanctum.emptyPlansTitle")}
              text={t("sanctum.emptyPlansText")}
            />
          </div>
        )}
      </div>
    </Section>
  );
}
