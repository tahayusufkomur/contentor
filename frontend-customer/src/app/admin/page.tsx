"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { PageState } from "@/components/ui/page-state";
import { clientFetch } from "@/lib/api-client";
import {
  BookOpen,
  DollarSign,
  ExternalLink,
  HardDrive,
  Mail,
  Newspaper,
  Plus,
  Users,
  Video,
} from "lucide-react";
import { UsageAdoptionCard } from "@/components/admin/usage-adoption-card";
import { formatMoney } from "@/lib/format";
import { useSetupStatus, useTenantCurrency } from "@/lib/setup-assistant";
import { PublishCard } from "@/components/admin/publish-card";
import { SetupGuideCard } from "@/components/admin/setup-guide-card";
import { KIND_ROUTES } from "@/lib/focus/kinds";
import { useFocusOverview } from "@/lib/focus/store";
import { useAdminUser } from "@/hooks/use-admin-user";
import { useTenant } from "@/hooks/use-tenant";
import { firstName, greetingKey, lookSummary } from "@/lib/admin-welcome";

export const dynamic = "force-dynamic";

interface DashboardStats {
  students: number;
  courses: number;
  revenue: number;
  storage_used: string;
}

export default function AdminDashboard() {
  const t = useTranslations("admin");
  const user = useAdminUser();
  const config = useTenant();
  const currency = useTenantCurrency();
  const setup = useSetupStatus();
  const inProgress = useFocusOverview()?.open ?? [];
  // Until the status loads, show the overview line rather than flash "what's left".
  const published =
    !setup || Boolean(setup.items.find((i) => i.key === "publish")?.done);

  // The clock is read on the client after mount: the server's zone is not
  // hers, and a server-rendered "Good evening" patched to "Good morning"
  // would flash. Until then the heading is a neutral hello.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const greeting = t(`welcome.${greetingKey(hour)}`);
  const name = firstName(user?.name);
  const heading = name ? t("welcome.withName", { greeting, name }) : greeting;
  const look = lookSummary(config?.style, config?.palette);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    students: 0,
    courses: 0,
    revenue: 0,
    storage_used: "0 MB",
  });

  useEffect(() => {
    // Attempt to fetch stats; if endpoint doesn't exist yet, use defaults
    clientFetch<DashboardStats>("/api/v1/admin/stats/")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      title: "Students",
      value: stats.students.toLocaleString(),
      icon: Users,
      description: "Total enrolled",
    },
    {
      title: "Courses",
      value: stats.courses.toLocaleString(),
      icon: BookOpen,
      description: "Published & draft",
    },
    {
      title: "Revenue",
      value: formatMoney(stats.revenue, currency),
      icon: DollarSign,
      description: "All time",
    },
    {
      title: "Storage",
      value: stats.storage_used,
      icon: HardDrive,
      description: "Used",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome frame (spec 5.6): the greeting in `title`, the site's look
          and palette with "View site", the quick actions. The Today feed of
          the admin refactor's Phase 4 lands under this header later. */}
      <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-title text-foreground">{heading}</h1>
          <p className="mt-2 text-caption text-muted-foreground">
            {published ? t("welcome.overview") : t("welcome.whatsLeft")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-caption">
            <span className="flex items-center gap-1" aria-hidden="true">
              {look.colors.map((color, i) => (
                <span
                  key={i}
                  // The site's own palette, not studio chrome: the one place
                  // a colour is data rather than a token.
                  className="size-3.5 rounded-full border border-border"
                  style={{ background: color }}
                />
              ))}
            </span>
            <span className="font-medium text-foreground">
              {t("welcome.look", { look: look.label, palette: look.palette })}
            </span>
            <NavLink
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-marketing-accent hover:underline"
            >
              {t("viewSite")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </NavLink>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <NavLink href="/admin/courses/new">
              <Plus className="h-4 w-4" />
              New Course
            </NavLink>
          </Button>
          {inProgress.map((c) => (
            <Button
              key={c.id}
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5"
            >
              {/* No record yet (an event before she said where): its New page resumes it. */}
              <NavLink
                href={
                  c.record?.path ?? KIND_ROUTES[c.kind]?.newHref ?? "/admin"
                }
              >
                {t(`focus.kinds.${c.kind}.continue`, {
                  title: c.record?.title ?? c.title ?? "",
                })}
              </NavLink>
            </Button>
          ))}
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <NavLink href="/admin/live">
              <Video className="h-4 w-4" />
              Live Event
            </NavLink>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <NavLink href="/admin/messages/new">
              <Mail className="h-4 w-4" />
              Message
            </NavLink>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <NavLink href="/admin/blog">
              <Newspaper className="h-4 w-4" />
              Blog
            </NavLink>
          </Button>
        </div>
      </header>

      <SetupGuideCard />
      <PublishCard />

      {/* Stat cards */}
      <PageState
        loading={loading}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-5 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-caption font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-title-2 tabular-nums">{stat.value}</p>
                <p className="text-caption text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageState>

      <UsageAdoptionCard />
    </div>
  );
}
