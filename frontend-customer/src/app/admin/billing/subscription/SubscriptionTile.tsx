"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getSubscription,
  type PlatformSubscriptionState,
  type PlatformSubscriptionStatus,
} from "@/lib/api/billing-platform";
import { ApiError } from "@/types/api";

interface Props {
  /** Set when redirected back from a Stripe-hosted checkout. Triggers a 30-second
   *  polling loop on the subscription endpoint to bridge the gap between the
   *  user landing here and the webhook arriving. */
  pollUntilActive?: boolean;
  /** Display a "checkout canceled" notice above the tile. */
  showCanceledNotice?: boolean;
}

function StatusBadge({ status }: { status: PlatformSubscriptionStatus }) {
  const t = useTranslations("admin.subscription.status");
  const variantByStatus: Record<
    PlatformSubscriptionStatus,
    "default" | "secondary" | "success" | "warning" | "destructive"
  > = {
    free: "secondary",
    incomplete: "warning",
    active: "success",
    past_due: "warning",
    canceled: "destructive",
  };
  return <Badge variant={variantByStatus[status]}>{t(status)}</Badge>;
}

function formatDate(value: string | null | undefined, locale = "en") {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export function SubscriptionTile({
  pollUntilActive = false,
  showCanceledNotice = false,
}: Props) {
  const t = useTranslations("admin.subscription");
  const [state, setState] = useState<PlatformSubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const pollDeadline = Date.now() + 30_000;

    async function fetchOnce(): Promise<PlatformSubscriptionState | null> {
      try {
        const data = await getSubscription();
        if (!cancelled) {
          setState(data);
          setLoading(false);
          setError(null);
        }
        return data;
      } catch (err) {
        if (cancelled) return null;
        if (err instanceof ApiError) {
          setError(`Error ${err.status}`);
        } else {
          setError(t("error"));
        }
        setLoading(false);
        return null;
      }
    }

    fetchOnce().then((data) => {
      if (cancelled || !pollUntilActive) return;
      // Stop polling once we observe an active/past_due state, or once the
      // 30-second budget expires.
      if (data && (data.status === "active" || data.status === "past_due"))
        return;
      pollTimer = setInterval(async () => {
        if (cancelled || Date.now() > pollDeadline) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        const next = await fetchOnce();
        if (next && (next.status === "active" || next.status === "past_due")) {
          if (pollTimer) clearInterval(pollTimer);
        }
      }, 2500);
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [pollUntilActive, t]);

  return (
    <div className="space-y-4">
      {showCanceledNotice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {t("checkoutCanceled")}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>{t("title")}</span>
            {state && <StatusBadge status={state.status} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loading && !state ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : error ? (
            <p className="text-destructive">{error}</p>
          ) : state ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("plan")}
                </dt>
                <dd className="font-medium">{state.plan.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("currency")}
                </dt>
                <dd className="font-medium">{state.currency || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("nextBillingDate")}
                </dt>
                <dd className="font-medium">
                  {formatDate(state.current_period_end)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("provider")}
                </dt>
                <dd className="font-medium">{state.provider ?? "—"}</dd>
              </div>
              {state.status === "free" && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">{t("freeNotice")}</p>
                </div>
              )}
              {state.cancel_at_period_end && (
                <div className="sm:col-span-2">
                  <p className="text-amber-700 dark:text-amber-300">
                    {t("cancelsOn", {
                      date: formatDate(state.current_period_end),
                    })}
                  </p>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground">{t("noData")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
