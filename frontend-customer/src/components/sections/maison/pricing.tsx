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
import { BTN, H3, LABEL, NUM, Opener, Section, WRAP, money, roman } from "./ui";

/** The appointment: subscription plans set as ruled pedestals with roman numbering. */
export function PricingAppointment({ block, data, editable }: SectionProps) {
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
              "mx-auto mt-16 grid gap-x-10 gap-y-12 md:grid-cols-[repeat(var(--maison-cols),minmax(0,1fr))]",
              solo ? "max-w-[24rem]" : "max-w-[64rem]",
            )}
            style={
              {
                "--maison-cols": Math.max(plans.length, 1),
              } as CSSProperties
            }
          >
            {plans.map((p, i) => (
              <li
                key={p.id}
                className="flex flex-col items-center border-t border-foreground pt-7 text-center"
              >
                <p className={cn(LABEL, "text-muted-foreground")}>{roman(i)}</p>
                <h3 className={cn(H3, "mt-4 text-[1.5rem]")}>{p.name}</h3>
                <p
                  className={cn(
                    NUM,
                    "maison-opsz mt-6 font-display text-[3rem] leading-none",
                  )}
                >
                  {money(p.price, p.currency)}
                </p>
                <p className={cn(LABEL, "mt-3 text-muted-foreground")}>
                  {billingIntervalSuffix(p.billing_interval_months)}
                </p>
                {Boolean(p.item_count) && (
                  <p className={cn(LABEL, "mt-4 text-foreground")}>
                    {p.item_count} {p.item_count === 1 ? "piece" : "pieces"}
                  </p>
                )}
                {p.description && (
                  <p className="mt-5 max-w-[30ch] font-light text-[0.95rem] leading-[1.75] text-muted-foreground">
                    {p.description}
                  </p>
                )}
                <div className="mt-auto flex w-full flex-col items-center pt-9">
                  {p.is_subscribed ? (
                    <p className={cn(BTN, "pointer-events-none")}>Subscribed</p>
                  ) : (
                    <SubscribeButton
                      planId={p.id}
                      planName={p.name}
                      price={p.price}
                      currency={p.currency}
                      intervalMonths={p.billing_interval_months}
                      className="h-auto min-h-12 w-auto whitespace-normal rounded-none border border-foreground bg-transparent px-7 py-3 text-[0.68rem] font-normal uppercase tracking-[0.28em] text-foreground shadow-none hover:bg-foreground hover:text-background [&_svg]:hidden"
                    />
                  )}
                  <SmartLink
                    href={`/plans/${p.id}`}
                    className={cn(
                      LABEL,
                      "maison-link mt-5 text-muted-foreground",
                    )}
                  >
                    What&rsquo;s included
                  </SmartLink>
                </div>
              </li>
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
