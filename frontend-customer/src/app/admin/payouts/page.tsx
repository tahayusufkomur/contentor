"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Wallet,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageState } from "@/components/ui/page-state";
import { useEntitlements } from "@/components/admin/entitlements-provider";
import { clientFetch } from "@/lib/api-client";
import { useAsyncAction } from "@shared/hooks/use-async-action";

interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  is_paid_active: boolean;
  can_monetize: boolean;
  /** Stripe Express countries; the account's country is fixed once created. */
  countries: string[];
  default_country: string;
}

export default function PayoutsPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const searchParams = useSearchParams();
  // Stripe redirects back with ?connect=return after onboarding; refresh live
  // so the UI reflects readiness before the account.updated webhook lands.
  const justReturned = searchParams.get("connect") === "return";

  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await clientFetch<ConnectStatus>(
        `/api/v1/billing/connect/status/${justReturned ? "?refresh=1" : ""}`,
      );
      setStatus(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [justReturned]);

  useEffect(() => {
    load();
  }, [load]);

  // null = untouched, so the server's guess (from the coach's location) shows.
  const [pickedCountry, setPickedCountry] = useState<string | null>(null);
  const country = pickedCountry ?? status?.default_country ?? "US";
  const countryName = (code: string) => {
    try {
      return (
        new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code
      );
    } catch {
      return code;
    }
  };

  const { run: startOnboarding, loading: onboarding } = useAsyncAction(
    async () => {
      const { onboarding_url } = await clientFetch<{ onboarding_url: string }>(
        "/api/v1/billing/connect/onboard/",
        { method: "POST", body: JSON.stringify({ country }) },
      );
      window.location.href = onboarding_url;
    },
    { errorToast: t("payouts.onboardError") },
  );

  const { run: openDashboard, loading: openingDashboard } = useAsyncAction(
    async () => {
      const { dashboard_url } = await clientFetch<{ dashboard_url: string }>(
        "/api/v1/billing/connect/dashboard/",
      );
      window.open(dashboard_url, "_blank", "noopener");
    },
    { errorToast: t("payouts.dashboardError") },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.payouts")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("payouts.subtitle")}</p>
      </div>

      <PageState
        loading={loading}
        error={error}
        onRetry={load}
        className="space-y-6"
        skeleton={
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-9 w-48" />
            </CardContent>
          </Card>
        }
      >
        {!status?.is_paid_active ? (
          <UpgradeGate />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <CardTitle>{t("payouts.stripeTitle")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {!status.connected ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t("payouts.notConnected")}
                  </p>
                  <div className="space-y-1">
                    <label
                      htmlFor="payout-country"
                      className="text-sm font-medium"
                    >
                      {t("payouts.country")}
                    </label>
                    <select
                      id="payout-country"
                      value={country}
                      onChange={(e) => setPickedCountry(e.target.value)}
                      className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {status.countries.map((code) => (
                        <option key={code} value={code}>
                          {countryName(code)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {t("payouts.countryHint")}
                    </p>
                  </div>
                  <Button
                    onClick={startOnboarding}
                    loading={onboarding}
                    loadingText={t("payouts.redirecting")}
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t("payouts.connect")}
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <StatusRow
                      ok={status.charges_enabled}
                      okLabel={t("payouts.paymentsOn")}
                      pendingLabel={t("payouts.paymentsOff")}
                    />
                    <StatusRow
                      ok={status.payouts_enabled}
                      okLabel={t("payouts.payoutsOn")}
                      pendingLabel={t("payouts.payoutsOff")}
                    />
                  </div>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {status.charges_enabled ? (
                      <Button
                        variant="outline"
                        onClick={openDashboard}
                        loading={openingDashboard}
                        loadingText={t("payouts.opening")}
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t("payouts.openDashboard")}
                      </Button>
                    ) : (
                      <Button
                        onClick={startOnboarding}
                        loading={onboarding}
                        loadingText={t("payouts.redirecting")}
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t("payouts.continueSetup")}
                      </Button>
                    )}
                  </div>
                  {!status.charges_enabled && (
                    <p className="text-xs text-muted-foreground">
                      {t("payouts.reviewing")}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {status?.is_paid_active && <EarningsCard />}
      </PageState>
    </div>
  );
}

interface Earnings {
  currency: string;
  gross_sales: string;
  net_payout: string;
  platform_fees: string;
  sales_count: number;
  refunded_total: string;
  stripe_balance: Record<
    string,
    { available?: number; pending?: number }
  > | null;
}

function money(amount: string | number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
}

function EarningsCard() {
  const locale = useLocale();
  const t = useTranslations("admin.payouts");
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientFetch<Earnings>("/api/v1/billing/earnings/")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const cur = data.currency;
  const pending = data.stripe_balance?.[cur]?.pending;
  const available = data.stripe_balance?.[cur]?.available;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("earnings")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label={t("netPayout")}
            value={money(data.net_payout, cur, locale)}
          />
          <Stat
            label={t("grossSales")}
            value={money(data.gross_sales, cur, locale)}
            sub={t("salesCount", { count: data.sales_count })}
          />
          <Stat
            label={t("platformFees")}
            value={money(data.platform_fees, cur, locale)}
          />
          <Stat
            label={t("refunded")}
            value={money(data.refunded_total, cur, locale)}
          />
        </div>
        {data.stripe_balance && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-6 text-sm">
              <span className="text-muted-foreground">
                {t("pending")}{" "}
                <span className="font-medium text-foreground">
                  {money((pending ?? 0) / 100, cur, locale)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {t("available")}{" "}
                <span className="font-medium text-foreground">
                  {money((available ?? 0) / 100, cur, locale)}
                </span>
              </span>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">{t("earningsNote")}</p>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StatusRow({
  ok,
  okLabel,
  pendingLabel,
}: {
  ok: boolean;
  okLabel: string;
  pendingLabel: string;
}) {
  const t = useTranslations("admin.payouts");
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-marketing-accent" />
      ) : (
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {ok ? okLabel : pendingLabel}
      </span>
      <Badge variant={ok ? "success" : "secondary"} className="ml-auto">
        {ok ? t("enabled") : t("pendingBadge")}
      </Badge>
    </div>
  );
}

function UpgradeGate() {
  const t = useTranslations("admin.payouts");
  // On a trial the plan is there already: payouts open when it starts.
  const trialing = useEntitlements().entitlements?.trialing;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <CardTitle>
            {trialing ? t("trialTitle") : t("upgradeTitle")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {trialing ? t("trialBody") : t("upgradeBody")}
        </p>
        <Button asChild className="gap-2">
          <Link href="/admin/billing">
            <Wallet className="h-4 w-4" />
            {trialing ? t("startPlan") : t("viewPlans")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
