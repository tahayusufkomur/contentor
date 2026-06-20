"use client";

import { useEffect, useState } from "react";
import { Globe, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TenantUsageRow {
  tenant: string;
  slug: string;
  installed: number;
  pwa_sessions: number;
  browser_sessions: number;
  pwa_pct: number;
}

interface PlatformUsage {
  installed_students: number;
  pwa_sessions: number;
  browser_sessions: number;
  pwa_pct: number;
  by_tenant: TenantUsageRow[];
}

export function PlatformUsageCard() {
  const [data, setData] = useState<PlatformUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/v1/platform/usage/", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const webPct =
    data.pwa_sessions + data.browser_sessions ? 100 - data.pwa_pct : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">App Adoption (PWA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className="text-3xl font-bold text-foreground">
              {data.installed_students}
            </p>
            <p className="text-xs text-muted-foreground">
              students installed the app
            </p>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1.5">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-primary"
                style={{ width: `${data.pwa_pct}%` }}
              />
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
        </div>

        {data.by_tenant.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Installed</TableHead>
                <TableHead className="text-right">PWA %</TableHead>
                <TableHead className="text-right">30d sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_tenant.map((row) => (
                <TableRow key={row.slug}>
                  <TableCell>
                    <span className="font-medium text-foreground">
                      {row.tenant}
                    </span>
                    <p className="text-xs text-muted-foreground">{row.slug}</p>
                  </TableCell>
                  <TableCell className="text-right">{row.installed}</TableCell>
                  <TableCell className="text-right">{row.pwa_pct}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.pwa_sessions + row.browser_sessions}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No app activity recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
