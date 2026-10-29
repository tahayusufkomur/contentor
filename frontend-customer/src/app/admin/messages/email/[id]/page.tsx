"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  cancelCampaign,
  getCampaign,
  listCampaignRecipients,
  renderEmail,
  updateDraft,
  type EmailCampaign,
  type CampaignRecipientEntry,
} from "@/lib/email-api";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import {
  SkeletonForm,
  SkeletonPageHeader,
  SkeletonTable,
} from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { normalizeDesign } from "@shared/email/editor";
import { useLocale, useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

// Semantic status tints that read on both light and dark surfaces: a low-opacity
// fill (theme-agnostic) plus a foreground that steps lighter under dark/dim.
const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-muted text-foreground",
  sending: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const RECIPIENT_STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export default function CampaignDetailPage() {
  const locale = useLocale();
  const t = useTranslations("admin.messages");
  const params = useParams();
  const campaignId = Number(params.id);
  const router = useRouter();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getCampaign(campaignId),
      listCampaignRecipients(campaignId).catch(() => ({ results: [] })),
    ])
      .then(([campaignData, recipientData]) => {
        if (cancelled) return;
        if (campaignData.status === "draft") {
          // Not sent yet: it opens in the editor.
          router.replace(`/admin/messages/email/${campaignId}/edit`);
          return;
        }
        setCampaign(campaignData);
        setRecipients(recipientData.results);
        if (!campaignData.rendered_html && campaignData.design) {
          // Scheduled: drawn now, as it will go out.
          renderEmail(
            normalizeDesign(campaignData.design),
            campaignData.subject,
            campaignData.preheader,
          )
            .then(({ html }) => !cancelled && setPreview(html))
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, reloadKey, router]);

  const html = campaign?.rendered_html || preview;

  // Editing a scheduled email takes it off the schedule until she schedules it again.
  const { run: edit, loading: editing } = useAsyncAction(async () => {
    if (!window.confirm(t("campaign.confirmEdit"))) return;
    await updateDraft(campaignId, {});
    navigate(`/admin/messages/email/${campaignId}/edit`);
  });
  const { run: cancel, loading: cancelling } = useAsyncAction(async () => {
    if (!window.confirm(t("campaign.confirmCancel"))) return;
    await cancelCampaign(campaignId);
    toast.success(t("done.cancel"));
    navigate("/admin/messages");
  });

  return (
    <div className="space-y-8">
      <NavLink
        href="/admin/messages"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {t("back")}
      </NavLink>

      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <div className="space-y-8">
            <SkeletonPageHeader />
            <div className="grid gap-6 lg:grid-cols-2">
              <SkeletonForm fields={6} />
              <Skeleton className="h-[400px] w-full rounded-lg" />
            </div>
            <SkeletonTable rows={5} cols={5} />
          </div>
        }
        className="space-y-8"
      >
        {campaign && (
          <>
            {/* Campaign metadata + preview */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left: Metadata */}
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold">{campaign.subject}</h1>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[campaign.status] || ""}`}
                  >
                    {t(`status.${campaign.status}`)}
                  </span>
                  {campaign.status === "scheduled" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {campaign.scheduled_at && (
                        <p className="mr-2 text-sm text-muted-foreground">
                          {t("campaign.goesOut", {
                            when: new Date(
                              campaign.scheduled_at,
                            ).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }),
                          })}
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => edit()}
                        loading={editing}
                      >
                        {t("campaign.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => cancel()}
                        loading={cancelling}
                      >
                        {t("campaign.cancelSending")}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">
                      {t("campaign.template")}
                    </span>
                    <span>{campaign.template_name || "—"}</span>
                  </div>
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">
                      {t("campaign.sender")}
                    </span>
                    <span>
                      {campaign.sender_name || campaign.sender_email || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">
                      {t("campaign.recipients")}
                    </span>
                    <span>
                      {campaign.recipient_count}
                      {campaign.recipient_summary &&
                        ` — ${campaign.recipient_summary}`}
                    </span>
                  </div>
                  {campaign.status !== "scheduled" && (
                    <div className="flex justify-between border-b py-2">
                      <span className="text-muted-foreground">
                        {t("campaign.delivered")}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {t("campaign.sentCount", {
                          count: campaign.success_count,
                        })}
                      </span>
                    </div>
                  )}
                  {campaign.failure_count > 0 && (
                    <div className="flex justify-between border-b py-2">
                      <span className="text-muted-foreground">
                        {t("receipt.failed")}
                      </span>
                      <span className="text-destructive">
                        {t("campaign.failedCount", {
                          count: campaign.failure_count,
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-b py-2">
                    <span className="text-muted-foreground">
                      {t("campaign.created")}
                    </span>
                    <span>
                      {new Date(campaign.created_at).toLocaleString(locale)}
                    </span>
                  </div>
                  {campaign.sent_at && (
                    <div className="flex justify-between border-b py-2">
                      <span className="text-muted-foreground">
                        {t("campaign.completed")}
                      </span>
                      <span>
                        {new Date(campaign.sent_at).toLocaleString(locale)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Email preview */}
              <div>
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                  {t("campaign.preview")}
                </h2>
                {html ? (
                  <iframe
                    srcDoc={html}
                    sandbox=""
                    className="h-[70vh] w-full rounded-lg border"
                    title={t("campaign.preview")}
                  />
                ) : (
                  <div className="flex h-[400px] items-center justify-center rounded-lg border bg-muted/20">
                    <p className="text-sm text-muted-foreground">
                      {t("campaign.noPreview")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Recipients table */}
            <div>
              <h2 className="mb-4 text-lg font-semibold">
                {t("campaign.recipients")}
              </h2>
              {recipients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("campaign.noTracking")}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">
                        {t("campaign.colName")}
                      </th>
                      <th className="pb-2 font-medium">
                        {t("campaign.colEmail")}
                      </th>
                      <th className="pb-2 font-medium">
                        {t("campaign.colStatus")}
                      </th>
                      <th className="pb-2 font-medium">
                        {t("campaign.colSentAt")}
                      </th>
                      <th className="pb-2 font-medium">
                        {t("campaign.colError")}
                      </th>
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
                            {t(`status.${r.status}`)}
                          </span>
                        </td>
                        <td className="py-2">
                          {r.sent_at
                            ? new Date(r.sent_at).toLocaleString(locale)
                            : "—"}
                        </td>
                        <td className="py-2 text-destructive">
                          {r.error_message || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </PageState>
    </div>
  );
}
