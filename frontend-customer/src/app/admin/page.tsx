"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import {
  BookOpen,
  Download,
  HardDrive,
  Plus,
  Upload,
  Users,
  DollarSign,
} from "lucide-react";
import { UsageAdoptionCard } from "@/components/admin/usage-adoption-card";
import { PublishCard } from "@/components/admin/publish-card";
import { SetupGuideCard } from "@/components/admin/setup-guide-card";

export const dynamic = "force-dynamic";

interface DashboardStats {
  students: number;
  courses: number;
  revenue: number;
  storage_used: string;
}

export default function AdminDashboard() {
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
      value: `$${stats.revenue.toLocaleString()}`,
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back. Here is an overview of your platform.
        </p>
      </div>

      <SetupGuideCard />
      <PublishCard />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
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
            ))
          : statCards.map((stat) => (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* App adoption */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageAdoptionCard />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="gap-2">
            <Link href="/admin/courses/new">
              <Plus className="h-4 w-4" />
              Create Course
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/admin/downloads">
              <Upload className="h-4 w-4" />
              Upload Content
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
