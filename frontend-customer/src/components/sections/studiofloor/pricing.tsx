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
import { CHIP, H3, Opener, Section, WRAP, money } from "./ui";

/** Membership plans designed as dance studio access passes / tickets with
 *  notched sides, perforated dividers, and neon price tags. */
export function PricingPasses({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;
  const solo = plans.length === 1;

  return (
    <Section
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} cue="PASSES" />

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
                        STUDIO PASS // 0{i + 1}
                      </span>
                      {isFeatured && (
                        <span className="rounded-full bg-primary/20 px-2.5 py-0.5 studiofloor-display text-[0.72rem] font-extrabold italic text-primary shadow-[0_0_8px_var(--primary)]">
                          MOST POPULAR
                        </span>
                      )}
                    </div>

                    <h3 className={cn(H3, "mt-4 text-[1.6rem] leading-snug")}>
                      {plan.name}
                    </h3>

                    <p className="mt-5 flex items-baseline">
                      <span className="studiofloor-display text-[2.8rem] font-extrabold italic leading-none text-primary">
                        {money(plan.price, plan.currency)}
                      </span>
                      <span className="ml-2 studiofloor-display text-[0.88rem] font-bold text-muted-foreground">
                        {billingIntervalSuffix(plan.billing_interval_months)}
                      </span>
                    </p>

                    {/* Perforated ticket tear line */}
                    <div className="my-6 flex items-center gap-2">
                      <div className="h-px flex-1 border-t border-dashed border-border" />
                      <span className="studiofloor-display text-[0.68rem] tracking-widest text-muted-foreground/60">
                        TEAR HERE
                      </span>
                      <div className="h-px flex-1 border-t border-dashed border-border" />
                    </div>

                    {!!plan.item_count && (
                      <p className={cn(CHIP, "mb-4")}>
                        <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
                        {plan.item_count}{" "}
                        {plan.item_count === 1
                          ? "course/class"
                          : "courses/classes"}{" "}
                        included
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
                        CURRENT PASS
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
                      SEE INCLUDED SESSIONS
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
              title="No membership plans yet"
              text="Create a pass under Billing and it appears here automatically."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
