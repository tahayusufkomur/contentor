import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/billing";
import { EmptyHint, SubscribeButton, Txt, billingIntervalSuffix } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, DISPLAY, H2, Kicker, LABEL, WRAP, money } from "./ui";

/** Ticket cards: notched corner, perforation, giant condensed price. The
 *  middle of three is printed in volt. */
export function PricingTickets({ block, data, editable }: SectionProps) {
  const plans = Array.isArray(data) ? (data as SubscriptionPlan[]) : [];
  if (!plans.length && !editable) return null;
  const featured = plans.length === 3 ? 1 : -1;

  return (
    <section className="kinetic-paper py-20 md:py-32">
      <div className={WRAP}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(DISPLAY, H2, "mt-5 max-w-[18ch]")}
            />
          </div>
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            className="max-w-[44ch] text-lg leading-[1.55] text-muted-foreground lg:col-span-4"
          />
        </div>

        {plans.length === 0 ? (
          <div className="mt-12">
            <EmptyHint
              editable={editable}
              title="No membership plans yet"
              text="Create a subscription plan in Billing and it shows up here as a ticket."
            />
          </div>
        ) : (
          <ul
            className={cn(
              "mt-14 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-0 md:mt-20",
              plans.length === 1
                ? "max-w-xl"
                : plans.length === 2
                  ? "md:grid-cols-2 lg:max-w-5xl"
                  : "md:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {plans.map((p, i) => {
              const hot = i === featured;
              const [whole, cents] = money(p.price, p.currency).split(
                /(?=[.,]\d{2}$)/,
              );
              return (
                <li
                  key={p.id}
                  className={cn(
                    "kinetic-notch relative row-span-4 mb-6 grid grid-rows-[subgrid] [--kinetic-notch:36px]",
                    hot
                      ? "bg-accent text-accent-foreground lg:-translate-y-6"
                      : "kinetic-ink",
                  )}
                >
                  <div className="px-7 pt-7 md:px-9 md:pt-9">
                    <h3 className={cn(DISPLAY, "text-[2.25rem]")}>{p.name}</h3>
                    {p.description && (
                      <p
                        className={cn(
                          "mt-3 max-w-[34ch] leading-[1.55]",
                          !hot && "text-[color:var(--k-dim)]",
                        )}
                      >
                        {p.description}
                      </p>
                    )}
                  </div>
                  <p className="flex items-end gap-2 px-7 pb-8 pt-10 md:px-9">
                    <span
                      className={cn(
                        DISPLAY,
                        "text-[clamp(5.5rem,4rem+4vw,8.5rem)] tabular-nums [line-height:0.78]",
                      )}
                    >
                      {whole}
                      {cents && (
                        <span className="align-top text-[0.4em]">{cents}</span>
                      )}
                    </span>
                    <span className={cn(LABEL, "pb-2")}>
                      {billingIntervalSuffix(p.billing_interval_months)}
                    </span>
                  </p>

                  <div
                    aria-hidden="true"
                    className="relative mx-7 border-t-2 border-dashed border-[color:color-mix(in_oklch,currentColor_35%,transparent)] md:mx-9"
                  >
                    <span className="absolute -left-[42px] -top-[15px] size-7 rounded-full bg-background md:-left-[50px]" />
                    <span className="absolute -right-[42px] -top-[15px] size-7 rounded-full bg-background md:-right-[50px]" />
                  </div>

                  <div className="flex flex-col justify-end gap-6 p-7 md:p-9">
                    {p.item_count ? (
                      <p className="flex items-center gap-3 font-medium">
                        <span
                          aria-hidden="true"
                          className={cn(
                            DISPLAY,
                            "text-[1.75rem] [line-height:1]",
                            hot ? "text-primary" : "text-accent",
                          )}
                        >
                          +
                        </span>
                        {p.item_count} item{p.item_count === 1 ? "" : "s"}{" "}
                        included
                      </p>
                    ) : null}
                    {p.is_subscribed ? (
                      <p
                        className={cn(
                          LABEL,
                          "flex h-14 items-center justify-center border-2 border-current text-[0.8rem]",
                        )}
                      >
                        Subscribed
                      </p>
                    ) : (
                      <SubscribeButton
                        planId={p.id}
                        planName={p.name}
                        price={p.price}
                        currency={p.currency}
                        intervalMonths={p.billing_interval_months}
                        label={
                          <>
                            Subscribe
                            <Arrow />
                          </>
                        }
                        className={cn(
                          "kinetic-focus h-14 w-full justify-between rounded-none px-6 font-sans text-[0.8rem] font-extrabold uppercase tracking-[0.06em] shadow-none [font-stretch:125%]",
                          hot
                            ? "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
                            : "bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground",
                        )}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
