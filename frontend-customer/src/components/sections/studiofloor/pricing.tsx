import type { CSSProperties } from "react";
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
import { CHIP, H3, Opener, Section, WRAP, pad2 } from "./ui";
import { useLocale, useTranslations } from "next-intl";

/** Membership plans designed as dance studio access passes / tickets with
 *  notched sides, perforated dividers, and neon price tags. */
export function PricingPasses({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const locale = useLocale();
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;
  const solo = plans.length === 1;

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
          <ul
            className={cn(
              "mx-auto mt-14 grid gap-8",
              solo
                ? "max-w-[26rem]"
                : "max-w-[70rem] sm:grid-cols-2 lg:grid-cols-[repeat(var(--studiofloor-cols),minmax(0,1fr))]",
            )}
            style={
              { "--studiofloor-cols": solo ? 1 : plans.length } as CSSProperties
            }
          >
            {plans.map((plan, i) => {
              const isFeatured =
                plans.length === 3
                  ? i === 1
                  : plans.length > 1
                    ? i === 0
                    : false;

              return (
                <li
                  key={plan.id}
                  className={cn(
                    "studiofloor-pass relative flex flex-col justify-between rounded-[var(--radius)] p-8 transition-all duration-300",
                    isFeatured && "studiofloor-pass-highlight",
                  )}
                >
                  <div>
                    {/* Pass Header */}
                    <div className="flex items-center justify-between">
                      <span className="studiofloor-display text-xs font-extrabold uppercase tracking-widest text-accent">
                        {pad2(i)}
                      </span>
                    </div>

                    <h3 className={cn(H3, "mt-4 text-[1.6rem] leading-snug")}>
                      {plan.name}
                    </h3>

                    <p className="mt-5 flex items-baseline">
                      <span className="studiofloor-display text-[2.8rem] font-extrabold italic leading-none text-primary">
                        {formatMoney(plan.price, plan.currency, locale)}
                      </span>
                      <span className="ml-2 studiofloor-display text-[0.88rem] font-bold text-muted-foreground">
                        {billingIntervalSuffix(
                          plan.billing_interval_months,
                          (k, v) => t(`plan.${k}`, v),
                        )}
                      </span>
                    </p>

                    {/* Perforated ticket tear line */}
                    <div className="my-6 h-px border-t border-dashed border-border" />

                    {!!plan.item_count && (
                      <p className={cn(CHIP, "mb-4")}>
                        <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
                        {t("studiofloor.sessionsIncluded", {
                          count: plan.item_count,
                        })}
                      </p>
                    )}

                    {plan.description && (
                      <p className="max-w-[34ch] text-[0.98rem] leading-[1.65] text-muted-foreground">
                        {plan.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-8 pt-4">
                    {plan.is_subscribed ? (
                      <p className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius)] border border-primary/50 bg-primary/10 studiofloor-display text-[0.95rem] font-extrabold italic text-primary">
                        {t("plan.subscribed")}
                      </p>
                    ) : (
                      <SubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        price={plan.price}
                        currency={plan.currency}
                        intervalMonths={plan.billing_interval_months}
                        className={cn(
                          "studiofloor-focus studiofloor-glow-btn h-auto min-h-12 w-full whitespace-normal rounded-[var(--radius)] px-6 py-3 studiofloor-display text-[0.98rem] font-extrabold italic shadow-none [&_svg]:hidden",
                          isFeatured
                            ? "bg-primary text-primary-foreground shadow-[0_0_20px_color-mix(in_oklch,var(--primary)_40%,transparent)] hover:shadow-[0_0_30px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
                            : "border-2 border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground",
                        )}
                      />
                    )}

                    <SmartLink
                      href={`/plans/${plan.id}`}
                      className="studiofloor-link mt-4 block w-fit studiofloor-display text-[0.88rem] font-extrabold italic"
                    >
                      {t("studiofloor.seeIncludedSessions")}
                    </SmartLink>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-14">
            <EmptyHint
              editable={editable}
              title={t("empty.plans.title")}
              text={t("studiofloor.emptyPlansText")}
            />
          </div>
        )}
      </div>
    </Section>
  );
}
