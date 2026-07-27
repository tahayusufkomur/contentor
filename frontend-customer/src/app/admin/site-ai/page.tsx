"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { AiProgress } from "@/components/ui/ai-progress";
import { NavLink } from "@/components/ui/nav-link";
import { SkeletonForm } from "@/components/ui/skeletons";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { isAbortError } from "@/lib/ai-stream";
import {
  applySiteEdit,
  fetchSiteAiStatus,
  previewSiteEdit,
  type SiteAiStatus,
} from "@/lib/site-ai-api";

export const dynamic = "force-dynamic";

export default function AdminSiteAiPage() {
  const t = useTranslations("admin");
  const [status, setStatus] = useState<SiteAiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchSiteAiStatus());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Silent resync after a mutation: refreshes enabled/reason/remaining without
  // touching `loading`, so PageState never blanks the page back to a skeleton
  // (CLAUDE.md: full skeletons are first-load only).
  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await fetchSiteAiStatus());
    } catch {
      // Keep the optimistic values on a failed resync — the Apply succeeded.
    }
  }, []);

  // Previewing is always allowed — even with no allowance left, so the coach
  // can see what AI would do before deciding to upgrade.
  const { run: handlePreview, loading: previewing } = useAsyncAction(
    async () => {
      if (!instruction.trim()) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase(null);
      setPreview(null);
      try {
        const res = await previewSiteEdit(
          instruction.trim(),
          { onPhase: setPhase },
          controller.signal,
        );
        if (!res.pages) {
          // The backend's pre-stream budget/provider guard answered instead
          // of generating a preview (see site_ai_admin.py's site_ai_preview).
          toast.error(t("siteAi.error"));
          return;
        }
        setPreview(res.pages);
      } catch (err) {
        if (isAbortError(err)) return; // the coach cancelled; nothing to report
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    { errorToast: t("siteAi.error") },
  );

  const { run: handleApply, loading: applying } = useAsyncAction(
    async () => {
      if (!preview) return;
      const res = await applySiteEdit(preview);
      setPreview(null);
      setInstruction("");
      setStatus((prev) =>
        prev ? { ...prev, remaining: res.remaining } : prev,
      );
      toast.success(t("siteAi.applied"));
      void refreshStatus();
    },
    { errorToast: t("siteAi.error") },
  );

  const upsell = status?.reason === "upgrade_required";
  const exhausted = status?.reason === "quota_exhausted";

  return (
    <PageState
      loading={loading}
      error={error}
      skeleton={<SkeletonForm />}
      onRetry={load}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("siteAi.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("siteAi.subtitle")}
          </p>
        </div>

        {(upsell || exhausted) && (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">
              {upsell ? t("siteAi.upgradeTitle") : t("siteAi.exhaustedTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {upsell ? t("siteAi.upgradeBody") : t("siteAi.exhaustedBody")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {upsell && (
                <Button asChild size="sm" variant="brand">
                  <NavLink href="/admin/billing/subscription">
                    {t("siteAi.upgradeCta")}
                  </NavLink>
                </Button>
              )}
              {/* Manual editing is free on every plan — never a dead end. */}
              <Button asChild size="sm" variant="outline">
                <a href="/?edit=1" target="_blank" rel="noopener noreferrer">
                  {t("siteAi.manualCta")}
                </a>
              </Button>
            </div>
          </div>
        )}

        {status && status.limit > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("siteAi.remaining", {
              count: status.remaining,
              limit: status.limit,
            })}
          </p>
        )}

        {previewing ? (
          <AiProgress
            phases={[{ key: "thinking", label: t("siteAi.thinking") }]}
            currentPhase={phase}
            onCancel={() => abortRef.current?.abort()}
          />
        ) : (
          <div className="space-y-3">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("siteAi.placeholder")}
              rows={3}
              maxLength={400}
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
            <Button onClick={handlePreview} disabled={!instruction.trim()}>
              {t("siteAi.preview")}
            </Button>
          </div>
        )}

        {preview && !previewing && (
          <div className="rounded-lg border p-4">
            <p className="text-sm">{t("siteAi.ready")}</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="brand"
                onClick={handleApply}
                loading={applying}
                loadingText={t("siteAi.applying")}
                disabled={!status?.enabled}
              >
                {t("siteAi.apply")}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                {t("siteAi.discard")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageState>
  );
}
