"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, GraduationCap, Newspaper, Palette } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AiFeatureRollup {
  key: string;
  label: string;
  count: number;
  usd_spent: string;
  usd_cap: number;
  kill_switch_tripped: boolean;
}

interface AiTopTenant {
  tenant_schema: string;
  usd_spent: string;
  count: number;
}

interface AiDailyQuestion {
  date: string;
  count: number;
}

interface AiUsageRollup {
  month: string;
  features: AiFeatureRollup[];
  top_tenants: AiTopTenant[];
  ratings: { up: number; down: number; unrated: number };
  daily_questions: AiDailyQuestion[];
}

const FEATURE_ICONS: Record<string, typeof Bot> = {
  help_bot: Bot,
  student_bot: GraduationCap,
  blog_ai: Newspaper,
  brand_pack: Palette,
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
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

export default function AdminAiUsagePage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<AiUsageRollup | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    fetch(`/api/v1/platform/ai-usage/?month=${month}`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load AI usage");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [month]);

  const maxDaily = data
    ? Math.max(1, ...data.daily_questions.map((d) => d.count))
    : 1;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            AI usage
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-feature spend, kill-switch state, and question volume.
          </p>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="ai-usage-month"
            className="text-xs font-medium text-muted-foreground"
          >
            Month
          </label>
          <Input
            id="ai-usage-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!data && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Feature cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {data.features.map((feature) => {
              const Icon = FEATURE_ICONS[feature.key] ?? Bot;
              return (
                <Card key={feature.key} className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {feature.label}
                    </CardTitle>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-foreground">
                      {feature.count}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ${feature.usd_spent} / ${feature.usd_cap.toFixed(2)} spent
                    </p>
                    {feature.kill_switch_tripped && (
                      <Badge variant="destructive" className="mt-2">
                        Kill switch tripped
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Ratings + sparkline */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ratings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">
                  👍 {data.ratings.up} · 👎 {data.ratings.down} ·{" "}
                  {data.ratings.unrated} unrated
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preview (coach-testing) transcripts are excluded.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Questions, last 7 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.daily_questions.length > 0 ? (
                  <div className="flex items-end gap-2">
                    {data.daily_questions.map((d) => (
                      <div
                        key={d.date}
                        className="flex flex-1 flex-col items-center gap-1"
                        title={`${d.date}: ${d.count}`}
                      >
                        <div className="flex h-16 w-full items-end">
                          <div
                            className="w-full rounded-t bg-primary"
                            style={{
                              height: `${Math.max(4, (d.count / maxDaily) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {d.date.slice(5)}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {d.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No questions recorded in the last 7 days.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top tenants */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top tenants by spend</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_tenants.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant schema</TableHead>
                      <TableHead className="text-right">USD spent</TableHead>
                      <TableHead className="text-right">Questions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top_tenants.map((row) => (
                      <TableRow key={row.tenant_schema}>
                        <TableCell className="font-mono text-sm text-foreground">
                          {row.tenant_schema}
                        </TableCell>
                        <TableCell className="text-right">
                          ${row.usd_spent}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {row.count}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI spend recorded for this month.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Links */}
          <div className="flex flex-wrap gap-4">
            <Link
              href="/admin/m/ai-transcripts"
              className="text-sm font-medium text-primary hover:underline"
            >
              Browse transcripts
            </Link>
            <Link
              href="/admin/m/platform-kb"
              className="text-sm font-medium text-primary hover:underline"
            >
              Edit platform notes
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
