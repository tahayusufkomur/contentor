"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import { formatDay } from "@/lib/access/ways";

interface DailyPoint {
  day: string;
  pwa: number;
  browser: number;
}

interface UsageSummary {
  pwa_sessions: number;
  browser_sessions: number;
  pwa_pct: number;
  installed_students: number;
  daily: DailyPoint[];
}

export function UsageAdoptionCard() {
  const t = useTranslations("admin.usage");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientFetch<UsageSummary>("/api/v1/admin/usage/summary/?days=30")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (!data && !loading && !error) return null;

  const webPct = data
    ? data.pwa_sessions + data.browser_sessions
      ? 100 - data.pwa_pct
      : 0
    : 0;
  const maxDay = data
    ? data.daily.reduce((m, d) => Math.max(m, d.pwa + d.browser), 0)
    : 0;

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      }
    >
      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-2xl font-bold">{data.installed_students}</p>
              <p className="text-xs text-muted-foreground">{t("installed")}</p>
            </div>

            {/* PWA vs Web split */}
            <div className="space-y-1.5">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-primary"
                  style={{ width: `${data.pwa_pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />{" "}
                  {t("pwaShare", { pct: data.pwa_pct })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {t("webShare", { pct: webPct })}
                </span>
              </div>
            </div>

            {/* 30-day trend (dependency-free CSS bars) */}
            {maxDay > 0 ? (
              <div className="flex h-16 items-end gap-px">
                {data.daily.map((d) => {
                  const dayTotal = d.pwa + d.browser;
                  return (
                    <div
                      key={d.day}
                      className="flex flex-1 flex-col-reverse rounded-sm bg-muted-foreground/20"
                      style={{ height: `${(dayTotal / maxDay) * 100}%` }}
                      title={t("dayTitle", {
                        day: formatDay(d.day, locale),
                        pwa: d.pwa,
                        web: d.browser,
                      })}
                    >
                      <div
                        className="bg-primary"
                        style={{
                          height: dayTotal
                            ? `${(d.pwa / dayTotal) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("none")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </PageState>
  );
}
