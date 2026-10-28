import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { CreditCard, ArrowRight, Package } from "lucide-react";
import type { SubscriptionPlan } from "@/types/billing";
import { billingIntervalSuffix } from "@/lib/billing-interval";
import { formatMoney } from "@/lib/format";
import type { BlockComponentProps } from "@/lib/blocks/types";
import { useLocale, useTranslations } from "next-intl";

export function PricingPlansBlock({ data, dynamicData }: BlockComponentProps) {
  const locale = useLocale();
  const t = useTranslations("site");
  const plans: SubscriptionPlan[] = dynamicData ?? [];
  const gridClass =
    data.layout === "compact"
      ? "mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : "mx-auto grid max-w-4xl gap-6 sm:grid-cols-2";

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {(data.heading || data.subheading) && (
          <div className="mb-8 text-center">
            {data.heading && (
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                {data.heading}
              </h2>
            )}
            {data.subheading && (
              <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
                {data.subheading}
              </p>
            )}
          </div>
        )}

        {plans.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={t("blockEmpty.plans.title")}
            description={t("blockEmpty.plans.text")}
          />
        ) : (
          <div className={gridClass}>
            {plans.map((plan, i) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  i === plans.length - 1 ? "ring-2 ring-primary" : ""
                }`}
              >
                {i === plans.length - 1 && (
                  <Badge className="absolute right-3 top-3" variant="default">
                    {t("plan.bestValue")}
                  </Badge>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {plan.description && (
                    <CardDescription className="line-clamp-2">
                      {plan.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col space-y-5 pt-2">
                  <div>
                    <span className="font-display text-4xl font-bold tabular-nums">
                      {formatMoney(plan.price, plan.currency, locale)}
                    </span>
                    <span className="text-muted-foreground">
                      {billingIntervalSuffix(
                        plan.billing_interval_months,
                        (k, v) => t(`plan.${k}`, v),
                      )}
                    </span>
                  </div>

                  {plan.item_count !== undefined && plan.item_count > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4" />
                      <span>
                        {t("plan.itemsIncluded", { count: plan.item_count })}
                      </span>
                    </div>
                  )}

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    {plan.is_subscribed ? (
                      <Button className="w-full" variant="outline" disabled>
                        <CreditCard className="mr-2 h-4 w-4" />
                        {t("plan.subscribed")}
                      </Button>
                    ) : (
                      <SubscribeButton
                        planId={plan.id}
                        planName={plan.name}
                        price={plan.price}
                        currency={plan.currency}
                        intervalMonths={plan.billing_interval_months}
                        className="w-full"
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-1"
                      asChild
                    >
                      <Link href={`/plans/${plan.id}`}>
                        {t("plan.viewIncluded")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
