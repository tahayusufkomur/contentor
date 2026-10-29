"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

import { RecipientSelector } from "@/components/admin/email/recipient-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm } from "@/components/ui/skeletons";
import {
  getCampaign,
  renderEmail,
  sendCampaign,
  sendTest,
  updateDraft,
  type EmailCampaign,
  type RecipientFilter,
} from "@/lib/email-api";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { normalizeDesign } from "@shared/email/editor";
import { useLocale, useTranslations } from "next-intl";

const isFilter = (f: unknown): f is RecipientFilter =>
  !!f && typeof f === "object" && "type" in f;

/** The last step: who gets it and when, with the email as they will see it. */
export default function SendEmailPage() {
  const locale = useLocale();
  const t = useTranslations("admin.messages.send");
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const router = useRouter();

  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [subject, setSubject] = useState("");
  const [filter, setFilter] = useState<RecipientFilter>({ type: "all" });
  const [count, setCount] = useState<number | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCampaign(campaignId)
      .then(async (c) => {
        if (cancelled) return;
        if (c.status !== "draft") {
          router.replace(`/admin/messages/email/${campaignId}`);
          return;
        }
        setCampaign(c);
        setSubject(c.subject);
        if (isFilter(c.recipient_filter)) setFilter(c.recipient_filter);
        const { html } = await renderEmail(
          normalizeDesign(c.design),
          c.subject,
          c.preheader,
        );
        if (!cancelled) setHtml(html);
      })
      .catch((err) => !cancelled && setError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [campaignId, router, reloadKey]);

  const saveSubject = async () => {
    if (campaign && subject !== campaign.subject) {
      setCampaign(await updateDraft(campaignId, { subject }));
    }
  };

  const { run: test, loading: testing } = useAsyncAction(async () => {
    await saveSubject();
    const { sent_to } = await sendTest(campaignId);
    toast.success(t("testSent", { email: sent_to }));
  });

  const [leaving, setLeaving] = useState(false);
  const { run: send, loading: sending } = useAsyncAction(
    async (scheduledIso: string | null) => {
      await saveSubject();
      await sendCampaign(campaignId, {
        recipient_filter: filter,
        scheduled_at: scheduledIso,
      });
      toast.success(
        scheduledIso
          ? t("scheduled", {
              when: new Date(scheduledIso).toLocaleString(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })
          : t("onItsWay"),
      );
      setLeaving(true);
      navigate("/admin/messages");
    },
  );

  function submit() {
    if (!subject.trim()) return setProblem(t("needSubject"));
    if (filter.type === "course" && filter.course_ids.length === 0)
      return setProblem(t("needCourse"));
    if (filter.type === "individual" && filter.user_ids.length === 0)
      return setProblem(t("needStudent"));
    if (count === 0) return setProblem(t("nobody"));
    let scheduledIso: string | null = null;
    if (when === "later") {
      const at = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(at.getTime()))
        return setProblem(t("needTime"));
      if (at.getTime() <= Date.now()) return setProblem(t("needFuture"));
      scheduledIso = at.toISOString();
    }
    setProblem("");
    send(scheduledIso);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 border-b pb-5">
        <NavLink
          href={`/admin/messages/email/${campaignId}/edit`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToEditor")}
        </NavLink>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<SendSkeleton />}
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email-subject">{t("subject")}</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={() => saveSubject().catch(() => {})}
              />
            </div>

            <RecipientSelector
              value={filter}
              onChange={setFilter}
              recipientCount={count}
              onCountChange={setCount}
            />

            <div className="space-y-3">
              <Label>{t("when")}</Label>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label={t("when")}
              >
                {(
                  [
                    ["now", t("sendNow")],
                    ["later", t("schedule")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={when === value}
                    onClick={() => setWhen(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      when === value
                        ? "border-foreground bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {when === "later" && (
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  aria-label={t("sendAt")}
                />
              )}
            </div>

            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                className="flex-1"
                onClick={submit}
                loading={sending || leaving}
                loadingText={when === "later" ? t("scheduling") : t("sending")}
              >
                <Send className="h-4 w-4" />
                {when === "later"
                  ? t("schedule")
                  : count != null
                    ? t("sendTo", { count })
                    : t("send")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => test()}
                loading={testing}
                loadingText={t("sending")}
              >
                {t("sendTest")}
              </Button>
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">{t("asStudents")}</p>
            <iframe
              srcDoc={html}
              sandbox=""
              title={t("preview")}
              className="h-[75vh] w-full rounded-xl border bg-muted/30"
            />
          </div>
        </div>
      </PageState>
    </div>
  );
}

function SendSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <SkeletonForm />
      <Skeleton className="h-[60vh] w-full" />
    </div>
  );
}
