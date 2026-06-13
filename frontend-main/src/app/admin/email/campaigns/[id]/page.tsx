"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import {
  getCampaign,
  listCampaignRecipients,
  type CampaignRecipientEntry,
  type EmailCampaign,
} from "@/lib/platform-email-api";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  sending: "bg-blue-100 text-blue-800",
  sent: "bg-green-100 text-green-800",
  partial: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
};

const RECIPIENT_STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = Number(params.id);

  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    Promise.all([
      getCampaign(campaignId),
      listCampaignRecipients(campaignId).catch(() => ({ results: [] })),
    ])
      .then(([campaignData, recipientData]) => {
        setCampaign(campaignData);
        setRecipients(recipientData.results);
      })
      .catch(() => {
        setError("Failed to load campaign details.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [campaignId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/email"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to Campaigns
        </Link>
        <p className="text-sm text-muted-foreground">Loading campaign...</p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/email"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to Campaigns
        </Link>
        <p className="text-sm text-destructive">
          {error || "Campaign not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        href="/admin/email"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to Campaigns
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{campaign.subject}</h1>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[campaign.status] || ""}`}
            >
              {campaign.status}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Template</span>
              <span>{campaign.template_name || "—"}</span>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Sender</span>
              <span>
                {campaign.sender_name || campaign.sender_email || "—"}
              </span>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Recipients</span>
              <span>
                {campaign.recipient_count} — {campaign.recipient_summary || "—"}
              </span>
            </div>
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Delivered</span>
              <span className="text-green-700">
                {campaign.success_count} sent
              </span>
            </div>
            {campaign.failure_count > 0 && (
              <div className="flex justify-between border-b py-2">
                <span className="text-muted-foreground">Failed</span>
                <span className="text-red-700">
                  {campaign.failure_count} failed
                </span>
              </div>
            )}
            <div className="flex justify-between border-b py-2">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(campaign.created_at).toLocaleString()}</span>
            </div>
            {campaign.sent_at && (
              <div className="flex justify-between border-b py-2">
                <span className="text-muted-foreground">Completed</span>
                <span>{new Date(campaign.sent_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Email Preview
          </h2>
          {campaign.rendered_html ? (
            <iframe
              srcDoc={campaign.rendered_html}
              sandbox=""
              className="h-[400px] w-full rounded-lg border"
              title="Email preview"
            />
          ) : (
            <div className="flex h-[400px] items-center justify-center rounded-lg border bg-muted/20">
              <p className="text-sm text-muted-foreground">
                Preview not available for this campaign.
              </p>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Recipients</h2>
        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recipient records for this campaign.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Sent At</th>
                <th className="pb-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.user_name || "—"}</td>
                  <td className="py-2">{r.user_email}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${RECIPIENT_STATUS_COLORS[r.status] || ""}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 text-red-600">{r.error_message || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
