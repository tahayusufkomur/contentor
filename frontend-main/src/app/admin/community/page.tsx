"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
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
import {
  getCommunityRollup,
  type CommunityRollup,
} from "@/lib/platform-community-api";

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
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

export default function PlatformCommunityPage() {
  const [data, setData] = useState<CommunityRollup | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getCommunityRollup()
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Community
        </h1>
        <p className="text-sm text-muted-foreground">
          Cross-tenant moderation rollup — open reports and posts awaiting
          approval by coach community.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!data && !error && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <StatSkeleton />
            <StatSkeleton />
          </div>
          <TableSkeleton />
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open reports
                </CardTitle>
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {data.total_open_reports}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Posts awaiting approval
                </CardTitle>
                <Clock className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {data.total_pending_posts}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">By tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Open reports</TableHead>
                    <TableHead>Pending posts</TableHead>
                    <TableHead>Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_tenant.map((row) => (
                    <TableRow key={row.slug}>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {row.tenant}
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">
                          ({row.slug})
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.enabled ? "success" : "secondary"}>
                          {row.enabled ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.open_reports > 0 ? (
                          <Badge variant="destructive">
                            {row.open_reports}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>{row.pending_posts}</TableCell>
                      <TableCell>{row.members}</TableCell>
                    </TableRow>
                  ))}
                  {data.by_tenant.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-muted-foreground"
                      >
                        No tenant has the community enabled yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            To act on a report, impersonate the tenant&apos;s coach and use
            their Community → Reports tab.
          </p>
        </>
      )}
    </div>
  );
}
