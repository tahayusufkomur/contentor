"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { listCampaigns, setupEmail, type EmailCampaign } from "@/lib/email-api";

const STATUS_STYLES: Record<string, string> = {
  sending: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export const dynamic = "force-dynamic";

export default function EmailDashboardPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await listCampaigns();
      setCampaigns(data.results);
      setTotal(data.count);
    } catch {
      setCampaigns([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setupEmail().catch(() => {
      // Non-blocking bootstrap: page remains usable even if provisioning fails.
    });
    fetchCampaigns();
  }, [fetchCampaigns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send beautiful emails to your students.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/email/templates"
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted/50"
          >
            Templates
          </Link>
          <Link
            href="/admin/email/compose"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            New Email
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border bg-muted/10 py-12 text-center">
          <p className="text-muted-foreground">No campaigns sent yet.</p>
          <Link
            href="/admin/email/compose"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Send your first email
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Subject</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Recipients</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Sent</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm font-medium">{campaign.subject}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[campaign.status] || ""}`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {campaign.recipient_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {campaign.success_count}/{campaign.recipient_count}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && campaigns.length > 0 && (
        <p className="text-xs text-muted-foreground">{total} campaign(s) total.</p>
      )}
    </div>
  );
}
