"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  getSubscription,
  updateSubscription,
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
  /** Called once a plan runs (trial or paid), e.g. to lift the paused admin. */
  onLive?: () => void;
}

/** A plan that runs the site: a trial, a paid plan, or one whose card failed. */
const LIVE: PlatformSubscriptionStatus[] = ["trialing", "active", "past_due"];

function StatusBadge({ status }: { status: PlatformSubscriptionStatus }) {
  const t = useTranslations("admin.subscription.status");
  const variantByStatus: Record<
    PlatformSubscriptionStatus,
    "default" | "secondary" | "success" | "warning" | "destructive" | "brand"
  > = {
    free: "secondary",
    none: "warning",
    incomplete: "warning",
    trialing: "brand",
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
  onLive,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("admin.subscription");
  const [state, setState] = useState<PlatformSubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const pollDeadline = Date.now() + 30_000;
    // Back from Checkout: the first fetch has the server pull the session.
    let session: string | null = pollUntilActive
      ? new URLSearchParams(window.location.search).get("session_id")
      : null;

    async function fetchOnce(): Promise<PlatformSubscriptionState | null> {
      try {
        const data = await getSubscription(session);
        session = null;
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
      // Stop polling once a plan runs, or once the 30-second budget expires.
      if (data && LIVE.includes(data.status)) {
        onLive?.();
        return;
      }
      pollTimer = setInterval(async () => {
        if (cancelled || Date.now() > pollDeadline) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        const next = await fetchOnce();
        if (next && LIVE.includes(next.status)) {
          if (pollTimer) clearInterval(pollTimer);
          onLive?.();
        }
      }, 2500);
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [pollUntilActive, onLive, t]);

  const { run: act, loading: acting } = useAsyncAction(
    async (action: "start_now" | "cancel" | "resume") => {
      const next = await updateSubscription(action);
      setState(next);
      setConfirmCancel(false);
      if (action === "start_now" && next.status !== "active")
        toast.error(t("startNowFailed"));
    },
    { errorToast: t("actionError") },
  );

  const trialing = state?.status === "trialing";
  // Stripe-billed plans only: a granted plan has nothing to cancel here.
  const selfServe =
    state?.provider === "stripe" || state?.provider === "bypass";
  const end = formatDate(state?.current_period_end, locale);

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
          ) : state?.status === "none" ? (
            <p className="text-muted-foreground">{t("noneNotice")}</p>
          ) : state ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("plan")}
                </dt>
                <dd className="font-medium capitalize">{state.plan.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("currency")}
                </dt>
                <dd className="font-medium">{state.currency || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {trialing ? t("trialEnds") : t("nextBillingDate")}
                </dt>
                <dd className="font-medium">{end}</dd>
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
              {trialing && !state.cancel_at_period_end && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">
                    {t("trialNotice", { date: end })}
                  </p>
                </div>
              )}
              {state.cancel_at_period_end && (
                <div className="sm:col-span-2">
                  <p className="text-amber-700 dark:text-amber-300">
                    {t("cancelsOn", { date: end })}
                  </p>
                </div>
              )}
              {selfServe && LIVE.includes(state.status) && (
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  {state.cancel_at_period_end ? (
                    <Button
                      size="sm"
                      onClick={() => act("resume")}
                      loading={acting}
                    >
                      {t("keepPlan")}
                    </Button>
                  ) : confirmCancel ? (
                    <>
                      <span className="w-full text-muted-foreground">
                        {t(
                          trialing ? "confirmCancelTrial" : "confirmCancelPlan",
                          {
                            date: end,
                          },
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => act("cancel")}
                        loading={acting}
                      >
                        {t(trialing ? "cancelTrial" : "cancelPlan")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmCancel(false)}
                      >
                        {t("keepPlan")}
                      </Button>
                    </>
                  ) : (
                    <>
                      {trialing && (
                        <Button
                          size="sm"
                          onClick={() => act("start_now")}
                          loading={acting}
                          loadingText={t("starting")}
                        >
                          {t("startNow")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmCancel(true)}
                      >
                        {t(trialing ? "cancelTrial" : "cancelPlan")}
                      </Button>
                    </>
                  )}
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
