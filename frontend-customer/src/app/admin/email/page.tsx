"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { listCampaigns, setupEmail, type EmailCampaign } from "@/lib/email-api";
import { PageState } from "@/components/ui/page-state";
import { SkeletonTable } from "@/components/ui/skeletons";
import { useNavigate } from "@shared/navigation/navigation-provider";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["All", "sending", "sent", "partial", "failed"] as const;

// Semantic status tints that read on both light and dark surfaces: a low-opacity
// fill (theme-agnostic) plus a foreground that steps lighter under dark/dim.
const STATUS_COLORS: Record<string, string> = {
  sending: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
};

type DateRange = "7d" | "30d" | "all";

function isWithinRange(dateStr: string, range: DateRange): boolean {
  if (range === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = range === "7d" ? 7 : 30;
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

export default function EmailDashboardPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [total, setTotal] = useState(0);

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCampaigns(100, 0);
      setCampaigns(data.results);
      setTotal(data.count);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    setupEmail().catch(() => {});
  }, [fetchCampaigns]);

  const filtered = useMemo(() => {
    let result = campaigns;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.subject.toLowerCase().includes(q));
    }
    if (statusFilter !== "All") {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (dateRange !== "all") {
      result = result.filter((c) => isWithinRange(c.created_at, dateRange));
    }
    return result;
  }, [campaigns, search, statusFilter, dateRange]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Send beautiful emails to your students.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/email/templates"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Templates
          </Link>
          <Link
            href="/admin/email/compose"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            New Email
          </Link>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by subject..."
          className="w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "All"
                ? "All statuses"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {(
            [
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["all", "All time"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setDateRange(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                dateRange === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <PageState
        loading={loading}
        error={error}
        onRetry={fetchCampaigns}
        skeleton={<SkeletonTable rows={6} cols={5} />}
      >
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">
              {campaigns.length === 0
                ? "No campaigns yet."
                : "No campaigns match your filters."}
            </p>
            {campaigns.length === 0 && (
              <Link
                href="/admin/email/compose"
                className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Send your first email
              </Link>
            )}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Recipients</th>
                  <th className="pb-2 font-medium">Sent</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() =>
                      navigate(`/admin/email/campaigns/${c.id}`)
                    }
                    className="cursor-pointer border-b hover:bg-muted/50"
                  >
                    <td className="py-3">{c.subject}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] || ""}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3">{c.recipient_count}</td>
                    <td className="py-3">
                      {c.success_count}/{c.recipient_count}
                    </td>
                    <td className="py-3">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {total} campaign(s).
            </p>
          </>
        )}
      </PageState>
    </div>
  );
}
