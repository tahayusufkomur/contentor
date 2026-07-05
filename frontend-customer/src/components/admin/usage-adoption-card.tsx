"use client";

import { useEffect, useState } from "react";
import { Globe, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";

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
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsageSummary | null>(null);

  useEffect(() => {
    clientFetch<UsageSummary>("/api/v1/admin/usage/summary/?days=30")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
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
    );
  }

  if (!data) return null;

  const webPct =
    data.pwa_sessions + data.browser_sessions ? 100 - data.pwa_pct : 0;
  const maxDay = data.daily.reduce((m, d) => Math.max(m, d.pwa + d.browser), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          App adoption (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-2xl font-bold">{data.installed_students}</p>
          <p className="text-xs text-muted-foreground">
            students installed the app
          </p>
        </div>

        {/* PWA vs Web split */}
        <div className="space-y-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${data.pwa_pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Smartphone className="h-3 w-3" /> PWA {data.pwa_pct}%
            </span>
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" /> Web {webPct}%
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
                  title={`${d.day}: ${d.pwa} PWA / ${d.browser} Web`}
                >
                  <div
                    className="bg-primary"
                    style={{
                      height: dayTotal ? `${(d.pwa / dayTotal) * 100}%` : "0%",
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No app activity yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
