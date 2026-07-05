export const dynamic = "force-dynamic";

import Link from "next/link";
import { serverFetch } from "@/lib/api-server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CreditCard,
  Radio,
  Tv,
  Download,
  ArrowLeft,
  Package,
  CheckCircle2,
} from "lucide-react";
import type { SubscriptionPlanDetail, PlanAccessItem } from "@/types/billing";
import { billingIntervalSuffix } from "@/lib/billing-interval";

const TYPE_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof BookOpen;
    href?: (item: PlanAccessItem) => string;
  }
> = {
  course: {
    label: "Course",
    icon: BookOpen,
    href: (item) => `/courses/${item.slug}`,
  },
  liveclass: {
    label: "Live Class",
    icon: Radio,
  },
  livestream: {
    label: "Live Stream",
    icon: Tv,
  },
  download: {
    label: "Download",
    icon: Download,
  },
};

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let plan: SubscriptionPlanDetail | null = null;
  try {
    plan = await serverFetch<SubscriptionPlanDetail>(
      `/api/v1/billing/plans/${id}/`,
    );
  } catch {
    plan = null;
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <CreditCard className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-2xl font-bold">Plan not found</h1>
        <p className="mt-2 text-muted-foreground">
          This plan does not exist or is no longer available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/plans"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All plans
      </Link>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              {plan.name}
            </h1>
            {plan.description && (
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                {plan.description}
              </p>
            )}
          </div>

          {/* Included content */}
          <div>
            <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
              What&apos;s Included
            </h2>
            {plan.items.length === 0 ? (
              <p className="text-muted-foreground">
                No content has been added to this plan yet.
              </p>
            ) : (
              <div className="space-y-3">
                {plan.items.map((item) => {
                  const config = TYPE_CONFIG[item.type] ?? {
                    label: item.type,
                    icon: Package,
                  };
                  const Icon = config.icon;
                  const linkHref = config.href?.(item);

                  const content = (
                    <Card
                      className={`overflow-hidden transition-all ${
                        linkHref
                          ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                          : ""
                      }`}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        {item.thumbnail_url ? (
                          <img
                            src={item.thumbnail_url}
                            alt={item.title}
                            className="h-16 w-24 flex-shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-accent/10">
                            <Icon className="h-6 w-6 text-primary/50" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold leading-snug line-clamp-1">
                            {item.title}
                          </h3>
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {config.label}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );

                  if (linkHref) {
                    return (
                      <Link key={`${item.type}-${item.id}`} href={linkHref}>
                        {content}
                      </Link>
                    );
                  }
                  return <div key={`${item.type}-${item.id}`}>{content}</div>;
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky sidebar */}
        <div>
          <Card className="sticky top-24 ring-1 ring-primary/10">
            <CardContent className="space-y-4 p-6">
              <div className="text-center">
                <p className="font-display text-3xl font-bold tabular-nums">
                  {plan.price}{" "}
                  <span className="text-lg font-normal text-muted-foreground">
                    {plan.currency}
                    {billingIntervalSuffix(plan.billing_interval_months)}
                  </span>
                </p>
              </div>
              {plan.is_subscribed ? (
                <Button className="w-full" variant="outline" disabled>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Subscribed
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
              <Separator />
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span>
                    {plan.items.length} item{plan.items.length !== 1 ? "s" : ""}{" "}
                    included
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
