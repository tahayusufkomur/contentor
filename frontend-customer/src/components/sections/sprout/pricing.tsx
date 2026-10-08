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
  Arrow,
  H3,
  Opener,
  PILL,
  Section,
  StarDoodle,
  Sticker,
  WRAP,
  money,
} from "./ui";

/** Membership and class passes styled as playful ticket-stub cards with
 *  cutout notches and star stickers. */
export function PricingTickets({ block, data, editable }: SectionProps) {
  const plans: SubscriptionPlan[] = Array.isArray(data) ? data : [];
  if (!plans.length && !editable) return null;

  return (
    <Section
      tone="surface"
      label={typeof block.heading === "string" ? block.heading : "Pricing"}
    >
      <div className={WRAP}>
        <Opener block={block} editable={editable} align="center" />

        {plans.length ? (
          <div
            className={cn(
              "mt-14 grid gap-8",
              plans.length === 1
                ? "mx-auto max-w-md"
                : plans.length === 2
                  ? "mx-auto max-w-3xl sm:grid-cols-2"
                  : "sm:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {plans.map((plan, i) => {
              const isPopular = plans.length > 1 ? i === 1 : true;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col justify-between overflow-hidden rounded-[2.5rem] border bg-card p-8 shadow-md transition-transform duration-200 motion-safe:hover:-translate-y-1.5",
                    isPopular
                      ? "border-primary/40 bg-[color-mix(in_oklch,var(--accent)_12%,var(--card))] ring-2 ring-primary/30"
                      : "border-[color-mix(in_oklch,var(--border)_75%,transparent)]",
                  )}
                >
                  {/* Highlight Sticker for popular plan */}
                  {isPopular && (
                    <div className="absolute right-6 top-6">
                      <Sticker
                        rotate="6deg"
                        className="gap-1 bg-accent px-3 py-1"
                      >
                        <StarDoodle className="size-3.5 text-accent-foreground" />
                        <span>Family Favourite</span>
                      </Sticker>
                    </div>
                  )}

                  {/* Top Ticket Stub */}
                  <div>
                    <div className="min-h-[5.5rem]">
                      <h3
                        className={cn(
                          H3,
                          "text-[1.5rem] font-bold leading-tight text-foreground",
                        )}
                      >
                        {plan.name}
                      </h3>
                      {plan.description && (
                        <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                    </div>

                    {!!plan.item_count && (
                      <div className="mt-4">
                        <span
                          className={cn(
                            PILL,
                            "bg-[color-mix(in_oklch,var(--primary)_15%,transparent)] text-primary font-bold",
                          )}
                        >
                          {plan.item_count}{" "}
                          {plan.item_count === 1 ? "activity" : "activities"}{" "}
                          included
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ticket Dashed Separator with Side Notches */}
                  <div className="relative my-8">
                    <span
                      aria-hidden="true"
                      className="sprout-ticket-notch-left"
                    />
                    <span
                      aria-hidden="true"
                      className="sprout-ticket-notch-right"
                    />
                    <div className="sprout-ticket-dash" />
                  </div>

                  {/* Bottom Ticket Stub (Price & CTA) */}
                  <div>
                    <div className="flex items-baseline">
                      <span className="font-display text-[2.6rem] font-bold leading-none text-foreground">
                        {money(plan.price, plan.currency)}
                      </span>
                      <span className="ml-2 text-[0.95rem] font-semibold text-muted-foreground">
                        {billingIntervalSuffix(plan.billing_interval_months)}
                      </span>
                    </div>

                    <div className="mt-6">
                      {plan.is_subscribed ? (
                        <div className="inline-flex min-h-12 w-full items-center justify-center rounded-full border-2 border-primary font-display text-[1rem] font-bold text-primary">
                          Subscribed
                        </div>
                      ) : (
                        <SubscribeButton
                          planId={plan.id}
                          planName={plan.name}
                          price={plan.price}
                          currency={plan.currency}
                          intervalMonths={plan.billing_interval_months}
                          className={cn(
                            "h-auto min-h-12 w-full rounded-full px-6 py-3 font-display text-[1rem] font-bold shadow-md transition-transform motion-safe:hover:-translate-y-0.5 [&_svg]:hidden",
                            isPopular
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : "bg-foreground text-background hover:bg-foreground/90",
                          )}
                        />
                      )}
                    </div>

                    <div className="mt-4 text-center">
                      <SmartLink
                        href={`/plans/${plan.id}`}
                        className="group inline-flex items-center gap-1.5 font-display text-[0.88rem] font-bold text-muted-foreground transition-colors hover:text-primary"
                      >
                        <span>See what&rsquo;s included</span>
                        <Arrow className="size-3" />
                      </SmartLink>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No passes or plans yet"
              text="Create a membership or ticket plan under Billing and it will show here."
            />
          </div>
        )}
      </div>
    </Section>
  );
}
