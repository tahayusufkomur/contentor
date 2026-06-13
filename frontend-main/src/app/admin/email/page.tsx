"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  listCampaigns,
  setupEmail,
  type EmailCampaign,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["All", "sending", "sent", "partial", "failed"] as const;

const STATUS_COLORS: Record<string, string> = {
  sending: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
  partial: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
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

export default function PlatformEmailDashboardPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await listCampaigns(100, 0);
      setCampaigns(data.results);
      setTotal(data.count);
    } catch {
      // ignore
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
            Send emails to coaches across the platform.
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

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by subject..."
          className="w-64 rounded-md border px-3 py-1.5 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading campaigns...</p>
      ) : filtered.length === 0 ? (
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
                  onClick={() => router.push(`/admin/email/campaigns/${c.id}`)}
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
    </div>
  );
}
