"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  GraduationCap,
  HardDrive,
  Banknote,
  Percent,
  Receipt,
  AlertTriangle,
  Bot,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyMap, type PlatformDashboard } from "@/types/tenant";
import { PlatformUsageCard } from "@/components/admin/platform-usage-card";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface DashboardTenant {
  name: string;
  slug: string;
  plan_name: string | null;
  provisioning_status: string;
  is_active: boolean;
  created_at: string;
}

interface DashboardData extends PlatformDashboard {
  recent_tenants?: DashboardTenant[];
}

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-3 w-16" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function statusBadgeVariant(
  status: string,
): "success" | "warning" | "destructive" {
  if (status === "ready") return "success";
  if (status === "pending" || status === "provisioning") return "warning";
  return "destructive";
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/platform/dashboard/", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform overview and recent activity.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  }

  const stats = [
    {
      label: "Total Tenants",
      value: data.total_tenants,
      description: "All registered tenants",
      icon: Users,
      href: "/admin/m/tenants",
    },
    {
      label: "Active Tenants",
      value: data.active_tenants,
      description: "Currently active",
      icon: UserCheck,
      href: "/admin/m/tenants",
    },
    {
      label: "Total Students",
      value: data.total_students,
      description: "Across all tenants",
      icon: GraduationCap,
    },
    {
      label: "Storage Used",
      value: formatBytes(data.total_storage_bytes),
      description: "Total platform storage",
      icon: HardDrive,
    },
    {
      label: "Subscription MRR",
      value: formatCurrencyMap(data.platform_subscriptions?.mrr_by_currency),
      description: `${data.platform_subscriptions?.active_subscriptions ?? 0} active coach subscriptions`,
      icon: Banknote,
      href: "/admin/m/platform-subscriptions",
    },
    {
      label: "Marketplace Fees",
      value: formatCurrencyMap(data.marketplace?.fees_by_currency),
      description: "Platform cut of student payments",
      icon: Percent,
    },
    {
      label: "Marketplace Volume",
      value: formatCurrencyMap(data.marketplace?.gross_by_currency),
      description: `${data.marketplace?.payment_count ?? 0} payments · ${data.monetization_ready_tenants ?? 0} coaches accepting payments`,
      icon: Receipt,
    },
    {
      label: "Webhook Failures",
      value: data.webhook_failures ?? 0,
      description: "Events with processing errors",
      icon: AlertTriangle,
      href: "/admin/m/webhook-events",
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Platform overview and recent activity.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const card = (
            <Card key={stat.label} className="h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p
                  className={`font-bold text-foreground ${String(stat.value).length > 12 ? "text-xl" : "text-3xl"}`}
                >
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
          return "href" in stat && stat.href ? (
            <Link key={stat.label} href={stat.href} className="block">
              {card}
            </Link>
          ) : (
            card
          );
        })}
      </div>

      {/* App adoption + AI usage */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PlatformUsageCard />
        </div>
        <Link href="/admin/ai" className="block">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">AI usage</CardTitle>
              <Bot className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Spend, kill-switch state, and question volume across the help
                bot, student assistant, blog AI, and Brand Pack.
              </p>
              <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                View dashboard <ArrowRight className="h-3.5 w-3.5" />
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Tenants */}
      {data.recent_tenants && data.recent_tenants.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Tenants</CardTitle>
            <Link
              href="/admin/m/tenants"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_tenants.map((tenant) => (
                  <TableRow key={tenant.slug}>
                    <TableCell>
                      <Link
                        href={`/admin/tenants/${tenant.slug}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {tenant.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {tenant.slug}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {tenant.plan_name || "None"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusBadgeVariant(tenant.provisioning_status)}
                      >
                        {tenant.provisioning_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
