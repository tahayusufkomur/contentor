import type { ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import type { SubscriptionPlan } from "@/types/billing";
import {
  EmptyHint,
  SmartLink,
  SubscribeButton,
  billingIntervalSuffix,
  type SiteT,
} from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, row, textLink } from "./ui";
import { useLocale, useTranslations } from "next-intl";

/** Subscribe button squared off; the price is already in the table. */
const subscribeCls =
  "h-auto min-h-12 w-full whitespace-normal rounded-none px-4 py-3 text-[0.9375rem] shadow-none hover:bg-foreground hover:text-background";

const billed = (t: SiteT, m?: number) => {
  const n = m ?? 1;
  if (n === 1) return t("grid.everyMonth");
  if (n === 12) return t("grid.everyYear");
  if (n % 12 === 0) return t("grid.everyYears", { count: n / 12 });
  return t("grid.everyMonths", { count: n });
};

const included = (t: SiteT, n?: number) =>
  n && n > 0 ? t("plan.items", { count: n }) : "—";

function Action({ plan }: { plan: SubscriptionPlan }) {
  const t = useTranslations("site");
  return (
    <div className="flex max-w-[22rem] flex-col items-start gap-4">
      {plan.is_subscribed ? (
        <p className="swiss-mono flex min-h-12 w-full items-center border border-foreground px-4">
          {t("plan.subscribed")}
        </p>
      ) : (
        <SubscribeButton
          planId={plan.id}
          planName={plan.name}
          price={plan.price}
          currency={plan.currency}
          intervalMonths={plan.billing_interval_months}
          className={subscribeCls}
          label={t("plan.subscribe")}
        />
      )}
      <SmartLink href={`/plans/${plan.id}`} className={textLink}>
        {t("plan.whatsIncluded")}
      </SmartLink>
    </div>
  );
}

function Price({ plan }: { plan: SubscriptionPlan }) {
  const locale = useLocale();
  const t = useTranslations("site");
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="swiss-step tabular-nums">
        {formatMoney(plan.price, plan.currency, locale)}
      </span>
      <span className="swiss-mono text-muted-foreground">
        {billingIntervalSuffix(plan.billing_interval_months, (k, v) =>
          t(`plan.${k}`, v),
        )}
      </span>
    </p>
  );
}

/** Plans as a real comparison table — only real plan fields are compared.
 *  The row-label column is the page's cols 1–3, so plans start on the axis. */
export function PricingTable({ block, data, editable }: SectionProps) {
  const t = useTranslations("site");
  const plans = (data ?? []) as SubscriptionPlan[];
  if (!plans.length && !editable) return null;

  const rows: { label: string; cell: (p: SubscriptionPlan) => ReactNode }[] = [
    { label: t("table.price"), cell: (p) => <Price plan={p} /> },
    {
      label: t("grid.billed"),
      cell: (p) => billed(t, p.billing_interval_months),
    },
    { label: t("plan.includes"), cell: (p) => included(t, p.item_count) },
    { label: t("plan.about"), cell: (p) => p.description || "—" },
  ];

  return (
    <Sheet>
      <Head block={block} editable={editable} />
      {!plans.length ? (
        <div className="mt-14">
          <EmptyHint
            editable={editable}
            title={t("empty.plans.title")}
            text={t("grid.emptyPlansText")}
          />
        </div>
      ) : (
        <>
          {/* Tablet and up: one column per plan. */}
          <table className="mt-14 hidden w-full table-fixed border-collapse text-left md:mt-20 md:table">
            <colgroup>
              <col className="w-[calc(25%_+_0.375rem)]" />
              {plans.map((p) => (
                <col key={p.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-t border-foreground">
                <td />
                {plans.map((p) => (
                  <th
                    key={p.id}
                    scope="col"
                    className="swiss-h3 px-0 pb-10 pr-6 pt-4 align-top font-medium"
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <th
                    scope="row"
                    className="swiss-mono py-5 pr-6 align-top font-normal text-muted-foreground"
                  >
                    {r.label}
                  </th>
                  {plans.map((p) => (
                    <td
                      key={p.id}
                      className="py-5 pr-6 align-top leading-[1.5]"
                    >
                      {r.cell(p)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-y border-foreground">
                <td />
                {plans.map((p) => (
                  <td key={p.id} className="py-6 pr-6 align-top">
                    <Action plan={p} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* Phones: each plan as its own ruled sheet. */}
          <div className="mt-12 space-y-12 md:hidden">
            {plans.map((p) => (
              <section
                key={p.id}
                aria-label={p.name}
                className="border-t border-foreground pt-4"
              >
                <h3 className="swiss-h3">{p.name}</h3>
                <dl className="mt-6">
                  {rows.map((r) => (
                    <div
                      key={r.label}
                      className={`${row} border-t border-border py-4`}
                    >
                      <dt className="swiss-mono col-span-4 text-muted-foreground">
                        {r.label}
                      </dt>
                      <dd className="col-span-8 leading-[1.5]">{r.cell(p)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="border-t border-border pt-5">
                  <Action plan={p} />
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
