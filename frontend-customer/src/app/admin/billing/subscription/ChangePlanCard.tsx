"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageState } from "@/components/ui/page-state";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  EmbeddedCheckoutOverlay,
  type CheckoutStart,
  type PlanTerms,
} from "@shared/checkout/embedded-checkout";
import { CoachPlanAside } from "@/components/billing/checkout-panels";
import { formatPlanName, formatPlanPrice } from "@shared/lib/format-plan-price";
import {
  getSubscription,
  listPlatformPlans,
  startCheckout,
  type PlatformPlanSummary,
  type PlatformSubscriptionState,
} from "@/lib/api/billing-platform";

type CurrencyCode = "USD" | "EUR";

/** Sort: Free first, then by USD amount ascending (Starter before Pro). */
function sortPlans(plans: PlatformPlanSummary[]): PlatformPlanSummary[] {
  return [...plans].sort((a, b) => {
    if (a.is_free && !b.is_free) return -1;
    if (!a.is_free && b.is_free) return 1;
    const av = a.prices?.USD?.amount_cents ?? a.amount_cents ?? 0;
    const bv = b.prices?.USD?.amount_cents ?? b.amount_cents ?? 0;
    return av - bv;
  });
}

/**
 * In-tenant upgrade UI. Renders one card per non-Free plan and either:
 *   - marks it as the user's current plan (disabled button + badge),
 *   - offers an "Upgrade to {plan}" button that starts a Stripe Checkout
 *     session and redirects on success,
 *   - shows a "Coming soon in {currency}" notice if no Stripe price ID is
 *     configured for that currency yet.
 *
 * Downgrade UX is intentionally minimal for M1 — we show "Contact support to
 * downgrade" rather than a full self-serve downgrade flow. The spec defers
 * downgrades; bundling it here would balloon scope.
 */
export function ChangePlanCard() {
  const locale = useLocale();
  const t = useTranslations("admin.subscription.changePlan");
  const tRoot = useTranslations("admin.subscription");
  const tPlan = useTranslations("studio.plan");
  const [subscription, setSubscription] =
    useState<PlatformSubscriptionState | null>(null);
  const [plans, setPlans] = useState<PlatformPlanSummary[] | null>(null);
  const [viewerCurrency, setViewerCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    async function load() {
      try {
        const [subRes, plansRes] = await Promise.all([
          getSubscription(),
          listPlatformPlans(),
        ]);
        if (cancelled) return;
        setSubscription(subRes);
        setPlans(plansRes.plans);
        setViewerCurrency(plansRes.currency);
      } catch {
        if (!cancelled) setLoadError(tRoot("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tRoot, reloadKey]);

  // The tenant's billing currency is decided once at signup (server-side).
  const currency: CurrencyCode = viewerCurrency === "EUR" ? "EUR" : "USD";

  const sortedPlans = useMemo(() => (plans ? sortPlans(plans) : []), [plans]);
  const currentPlanId = subscription?.plan?.id ?? null;
  // A running Stripe plan (a trial too) switches through support: a second
  // checkout would open a second subscription, and both would bill.
  const planRunning =
    ["trialing", "active", "past_due"].includes(subscription?.status ?? "") &&
    (subscription?.provider === "stripe" ||
      subscription?.provider === "bypass");
  const trial = subscription?.trial ?? null;
  const currentPlanIndex = useMemo(() => {
    if (currentPlanId == null) return -1;
    return sortedPlans.findIndex((p) => p.id === currentPlanId);
  }, [sortedPlans, currentPlanId]);

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("tryAgain")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Non-Free plans only — Free is the implicit baseline and is shown by the
  // SubscriptionTile above.
  // A plan with no price in the viewer's currency is not offered at all
  // (no "Coming soon" card) — unless it is their current plan.
  const paidPlans = sortedPlans.filter(
    (p) =>
      !p.is_free && (p.id === currentPlanId || p.prices?.[currency]?.available),
  );

  return (
    <PageState
      loading={loading}
      skeleton={
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </CardContent>
        </Card>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {actionError && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}
          {paidPlans.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("comingSoonInCurrency", { currency })}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {paidPlans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const planIndex = sortedPlans.findIndex((p) => p.id === plan.id);
              const isDowngrade =
                currentPlanIndex >= 0 && planIndex < currentPlanIndex;
              const priceEntry = plan.prices?.[currency];
              const available = Boolean(priceEntry?.available);
              return (
                <Card
                  key={plan.id}
                  className={isCurrent ? "border-primary" : undefined}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="capitalize">{plan.name}</span>
                      {isCurrent && (
                        <Badge variant="brand">{t("currentPlan")}</Badge>
                      )}
                    </CardTitle>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight text-foreground">
                        {formatPlanPrice(
                          currency,
                          priceEntry?.amount_cents ?? null,
                          locale,
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {tPlan("perMonth")}
                      </span>
                    </div>
                    {trial?.plan_id === plan.id && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("trialNote", { days: trial.days })}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Separator />
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>
                          {t("limits.students", { n: plan.max_students })}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>
                          {t("limits.storage", { n: plan.max_storage_gb })}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>
                          {t("limits.streamingHours", {
                            n: plan.max_streaming_hours,
                          })}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>
                          {t("limits.campaignEmails", {
                            n: plan.max_campaign_emails,
                          })}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>{t("limits.sell")}</span>
                      </li>
                      {plan.is_live_enabled && (
                        <li className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                          <span>{t("limits.live")}</span>
                        </li>
                      )}
                      {plan.max_ai_blog_posts > 0 && (
                        <li className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                          <span>
                            {t("limits.aiBlog", { n: plan.max_ai_blog_posts })}
                          </span>
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>
                          {t("limits.fee", {
                            n: Number(plan.transaction_fee_pct),
                          })}
                        </span>
                      </li>
                    </ul>
                    <UpgradeButton
                      plan={plan}
                      terms={{
                        name: plan.name,
                        currency,
                        amount_cents: priceEntry?.amount_cents ?? null,
                        trial_days: trial?.plan_id === plan.id ? trial.days : 0,
                      }}
                      isCurrent={isCurrent}
                      isDowngrade={isDowngrade || (planRunning && !isCurrent)}
                      available={available}
                      label={
                        isCurrent
                          ? t("currentPlan")
                          : planRunning
                            ? t("switchViaSupport")
                            : isDowngrade
                              ? t("downgrade")
                              : trial?.plan_id === plan.id
                                ? t("startTrial", { days: trial.days })
                                : t(
                                    // No plan at all (a paused site): nothing to upgrade from.
                                    subscription?.status === "none"
                                      ? "choose"
                                      : "upgradeTo",
                                    {
                                      plan:
                                        plan.name.charAt(0).toUpperCase() +
                                        plan.name.slice(1),
                                    },
                                  )
                      }
                      loadingLabel={t("processing")}
                      errorLabel={t("error")}
                      setActionError={setActionError}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </PageState>
  );
}

/** One plan's upgrade action, isolated so each row gets its own in-flight
 *  state — a single hook at the parent level would make every plan card
 *  share one loading flag. */
function UpgradeButton({
  plan,
  terms,
  isCurrent,
  isDowngrade,
  available,
  label,
  loadingLabel,
  errorLabel,
  setActionError,
}: {
  plan: PlatformPlanSummary;
  terms: PlanTerms;
  isCurrent: boolean;
  isDowngrade: boolean;
  available: boolean;
  label: string;
  loadingLabel: string;
  errorLabel: string;
  setActionError: (message: string | null) => void;
}) {
  const t = useTranslations("admin.subscription.changePlan");
  const [session, setSession] = useState<
    (CheckoutStart & { client_secret: string }) | null
  >(null);
  const { run: handleUpgrade, loading: pending } = useAsyncAction(
    async () => {
      setActionError(null);
      const res = await startCheckout(plan.id);
      if (res.client_secret)
        setSession({ ...res, client_secret: res.client_secret });
      else window.location.href = res.checkout_url ?? "";
    },
    { onError: () => setActionError(errorLabel) },
  );

  return (
    <>
      {session && (
        <EmbeddedCheckoutOverlay
          session={session}
          onClose={() => setSession(null)}
          aside={
            <CoachPlanAside
              title={t("planForSite", { plan: formatPlanName(plan.name) })}
              plan={terms}
            />
          }
        />
      )}
      <Button
        type="button"
        onClick={handleUpgrade}
        disabled={isCurrent || isDowngrade || !available}
        loading={pending}
        loadingText={loadingLabel}
        variant={isCurrent ? "outline" : "default"}
        className="w-full"
      >
        {label}
      </Button>
    </>
  );
}
