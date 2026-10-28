"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageState } from "@/components/ui/page-state";
import { SkeletonList } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";
import { billingIntervalSuffix } from "@/lib/billing-interval";
import { formatMoney } from "@/lib/format";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useLocale, useTranslations } from "next-intl";

interface MySubscription {
  id: number;
  plan_id: number;
  plan_name: string | null;
  status: string;
  billing_amount: string;
  billing_currency: string;
  billing_interval_months?: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  pending_plan_name: string | null;
}

interface PlanOption {
  id: number;
  name: string;
  price: string;
  currency: string;
  billing_interval_months?: number;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  active: "success",
  past_due: "warning",
  expired: "secondary",
};

function formatDate(iso: string | null, locale: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function SubscriptionsPage() {
  const locale = useLocale();
  const t = useTranslations("student.subscriptions");
  const tSite = useTranslations("site");
  const searchParams = useSearchParams();
  const [subs, setSubs] = useState<MySubscription[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      clientFetch<MySubscription[]>("/api/v1/billing/subscriptions/"),
      clientFetch<PlanOption[]>("/api/v1/billing/plans/"),
    ]);
    setSubs(s);
    setPlans(p);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (searchParams.get("sub") === "success") {
      toast.success(t("started"));
    }
    setLoading(true);
    setError(null);
    load()
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, searchParams, reloadKey, t]);

  const activeSubs = subs.filter((s) => s.status !== "expired");

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <SkeletonList count={3} />
        </div>
      }
      className="space-y-6"
    >
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("text")}</p>
      </div>

      {activeSubs.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("emptyTitle")}
          description={t("emptyText")}
          action={{ label: t("viewPlans"), href: "/plans" }}
        />
      ) : (
        <div className="space-y-4">
          {activeSubs.map((sub) => {
            const otherPlans = plans.filter((p) => p.id !== sub.plan_id);
            return (
              <Card key={sub.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {sub.plan_name ?? t("planFallback")}
                    </CardTitle>
                    <Badge variant={STATUS_VARIANT[sub.status] ?? "secondary"}>
                      {t.has(`status.${sub.status}` as "status.active")
                        ? t(`status.${sub.status}` as "status.active")
                        : sub.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(
                      sub.billing_amount,
                      sub.billing_currency,
                      locale,
                    )}
                    {billingIntervalSuffix(
                      sub.billing_interval_months,
                      (k, v) => tSite(`plan.${k}`, v),
                    )}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    {t.rich(
                      sub.cancel_at_period_end ? "cancelsOn" : "renewsOn",
                      {
                        date: formatDate(sub.current_period_end, locale),
                        b: (chunks) => (
                          <span className="font-medium text-foreground">
                            {chunks}
                          </span>
                        ),
                      },
                    )}
                  </p>
                  {sub.pending_plan_name && (
                    <p className="text-sm text-muted-foreground">
                      {t.rich("switchingTo", {
                        name: sub.pending_plan_name,
                        b: (chunks) => (
                          <span className="font-medium text-foreground">
                            {chunks}
                          </span>
                        ),
                      })}
                    </p>
                  )}

                  <Separator />

                  <SubscriptionRowActions
                    sub={sub}
                    otherPlans={otherPlans}
                    onChanged={load}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageState>
  );
}

function SubscriptionRowActions({
  sub,
  otherPlans,
  onChanged,
}: {
  sub: MySubscription;
  otherPlans: PlanOption[];
  onChanged: () => Promise<void>;
}) {
  const locale = useLocale();
  const t = useTranslations("student.subscriptions");
  const tc = useTranslations("common");
  const tSite = useTranslations("site");
  const { run: cancel, loading: cancelling } = useAsyncAction(
    async () => {
      await clientFetch(`/api/v1/billing/subscriptions/${sub.id}/cancel/`, {
        method: "POST",
      });
      toast.success(t("cancelled"));
      await onChanged();
    },
    { errorToast: t("cancelError") },
  );

  const { run: changePlan, loading: changingPlan } = useAsyncAction(
    async (planId: number) => {
      await clientFetch(
        `/api/v1/billing/subscriptions/${sub.id}/change-plan/`,
        {
          method: "POST",
          body: JSON.stringify({ plan_id: planId }),
        },
      );
      toast.success(t("planChanged"));
      await onChanged();
    },
    { errorToast: t("changeError") },
  );

  const busy = cancelling || changingPlan;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!sub.cancel_at_period_end && sub.status !== "expired" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => cancel()}
          loading={cancelling}
          disabled={changingPlan}
        >
          <XCircle className="h-4 w-4" /> {tc("actions.cancel")}
        </Button>
      )}
      {otherPlans.length > 0 && !sub.pending_plan_name && (
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <select
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v) changePlan(v);
            }}
            aria-label={t("changePlan")}
          >
            <option value="" disabled>
              {t("changePlanOption")}
            </option>
            {otherPlans.map((p) => (
              <option key={p.id} value={p.id}>
                {t("planOption", {
                  name: p.name,
                  price:
                    formatMoney(p.price, p.currency, locale) +
                    billingIntervalSuffix(p.billing_interval_months, (k, v) =>
                      tSite(`plan.${k}`, v),
                    ),
                })}
              </option>
            ))}
          </select>
        </div>
      )}
      {busy && <Spinner size="sm" />}
    </div>
  );
}
