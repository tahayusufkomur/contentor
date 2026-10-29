"use client";

import { useEffect, useState } from "react";
import {
  Circle,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Rocket,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import { blockerMeta } from "@/lib/publish-blockers";
import {
  useEntitlements,
  useIsLocked,
} from "@/components/admin/entitlements-provider";
import { refreshSetupStatus, useSetupStatus } from "@/lib/setup-assistant";
import { ApiError } from "@/types/api";

interface MeTenant {
  slug: string;
  name: string;
  is_published: boolean;
  has_preview_password: boolean;
  studio_url: string;
}

function pickCurrentTenant(tenants: MeTenant[]): MeTenant | null {
  if (tenants.length === 0) return null;
  if (typeof window !== "undefined") {
    const match = tenants.find((t) => {
      try {
        return new URL(t.studio_url).host === window.location.host;
      } catch {
        return false;
      }
    });
    if (match) return match;
  }
  return tenants.length === 1 ? tenants[0] : null;
}

// The backend enforces the same publish gate; surface it if a button was
// somehow triggered while requirements are unmet.
function patchErrorToast(
  err: unknown,
  t: ReturnType<typeof useTranslations<"admin.publish">>,
) {
  if (
    err instanceof ApiError &&
    err.data?.detail === "publish_requirements_unmet"
  ) {
    toast.error(t("requirementsUnmet"));
  } else {
    toast.error(t("wrong"));
  }
}

export function PublishCard() {
  const t = useTranslations("admin.publish");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const [tenant, setTenant] = useState<MeTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pw, setPw] = useState("");
  const [wentLive, setWentLive] = useState(false);
  const status = useSetupStatus();
  const freePlan = useIsLocked("selling");
  const trialing = useEntitlements().entitlements?.trialing;
  const blockers = status?.publish_blockers ?? [];
  const canPublish = blockers.length === 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    clientFetch<MeTenant[]>("/api/v1/me/tenants/")
      .then((list) => {
        if (!cancelled) setTenant(pickCurrentTenant(list));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function patchTenant(body: Record<string, unknown>): Promise<void> {
    if (!tenant) return;
    const updated = await clientFetch<Partial<MeTenant>>(
      `/api/v1/me/tenants/${tenant.slug}/`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
  }

  const { run: publish, loading: publishing } = useAsyncAction(
    async () => {
      if (!canPublish) return;
      await patchTenant({ is_published: true });
      void refreshSetupStatus();
      setWentLive(true);
    },
    { onError: (err) => patchErrorToast(err, t) },
  );

  const { run: unpublish, loading: unpublishing } = useAsyncAction(
    async () => {
      if (!window.confirm(t("confirmUnpublish"))) return;
      await patchTenant({ is_published: false });
      void refreshSetupStatus();
    },
    { onError: (err) => patchErrorToast(err, t) },
  );

  const { run: savePassword, loading: savingPassword } = useAsyncAction(
    async () => {
      const value = pw.trim();
      if (!value) return;
      await patchTenant({ preview_password: value });
      setPw("");
      toast.success(t("pwSaved"));
    },
    { onError: (err) => patchErrorToast(err, t) },
  );

  const { run: clearPassword, loading: clearingPassword } = useAsyncAction(
    async () => {
      await patchTenant({ preview_password: "" });
      toast.success(t("pwCleared"));
    },
    { onError: (err) => patchErrorToast(err, t) },
  );

  function copyLink() {
    if (!tenant) return;
    void navigator.clipboard?.writeText(tenant.studio_url);
    toast.success(t("linkCopied"));
  }

  function copyInstallGuide() {
    if (!tenant) return;
    void navigator.clipboard?.writeText(`${tenant.studio_url}/install`);
    toast.success(t("installCopied"));
  }

  return (
    <PageState
      loading={loading}
      error={loadError}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-9 w-40" />
          </CardContent>
        </Card>
      }
    >
      {tenant && wentLive && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label={t("close")}
              onClick={() => setWentLive(false)}
              className="absolute inset-0 bg-black/50"
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-xl"
            >
              <h3 className="text-lg font-semibold">{t("live")}</h3>
              <p className="text-sm text-muted-foreground">{t("liveHint")}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-sm">
                  {tenant.studio_url}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={copyLink}
                >
                  <Copy className="h-3.5 w-3.5" /> {t("copy")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={copyInstallGuide}
                >
                  <Copy className="h-3.5 w-3.5" /> {t("shareInstall")}
                </Button>
                <Button asChild size="sm">
                  <NavLink
                    href="/admin/students"
                    onClick={() => setWentLive(false)}
                  >
                    {t("inviteStudents")}
                  </NavLink>
                </Button>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWentLive(false)}
                >
                  {t("done")}
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {tenant && (
        <Card
          id="publish-card"
          className={tenant.is_published ? "" : "border-border bg-muted"}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {tenant.is_published ? (
                <>
                  <Globe className="h-4 w-4 text-chart-2" /> {t("siteLive")}
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 text-marketing-accent" />{" "}
                  {t("publishSite")}
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.is_published ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t.rich("liveStatus", {
                    live: (chunks) => (
                      <span className="font-medium text-chart-2">{chunks}</span>
                    ),
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <a
                      href={tenant.studio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {ta("viewSite")}
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={copyLink}
                  >
                    <Copy className="h-3.5 w-3.5" /> {t("copyLink")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={copyInstallGuide}
                  >
                    <Copy className="h-3.5 w-3.5" /> {t("shareInstall")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={unpublish}
                    loading={unpublishing}
                    loadingText={t("unpublishing")}
                  >
                    {t("unpublish")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("hidden")}</p>
                {!canPublish && (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="mb-2 text-sm font-medium text-foreground">
                      {t("finishFirst")}
                    </p>
                    <ul className="space-y-1.5">
                      {blockers.map((key) => {
                        const meta = blockerMeta(
                          key,
                          {
                            onFreePlan: freePlan,
                            trialing,
                          },
                          ta,
                        );
                        return (
                          <li key={key}>
                            <NavLink
                              href={meta.href}
                              className="flex items-center gap-2 text-sm text-marketing-accent underline-offset-2 hover:underline"
                            >
                              <Circle className="h-3.5 w-3.5 shrink-0" />
                              {meta.label}
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <Button
                  onClick={publish}
                  disabled={!canPublish}
                  loading={publishing}
                  loadingText={t("publishing")}
                  className="gap-2"
                  title={canPublish ? undefined : t("finishSteps")}
                >
                  <Rocket className="h-4 w-4" /> {t("publishGoLive")}
                </Button>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("previewLink")}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    {tenant.studio_url}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2"
                    onClick={copyLink}
                  >
                    <Copy className="h-3 w-3" /> {t("copy")}
                  </Button>
                </div>
              </>
            )}

            {/* Preview password — only meaningful while the site is hidden */}
            {!tenant.is_published && (
              <div className="space-y-2 border-t pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />{" "}
                  {tenant.has_preview_password ? t("pwIsSet") : t("pw")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="text"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder={
                      tenant.has_preview_password ? t("pwChange") : t("pwSet")
                    }
                    className="h-9 w-48"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={savePassword}
                    disabled={!pw.trim()}
                    loading={savingPassword}
                    loadingText={t("saving")}
                  >
                    {tc("actions.save")}
                  </Button>
                  {tenant.has_preview_password && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearPassword}
                      loading={clearingPassword}
                      loadingText={t("clearing")}
                    >
                      {t("clear")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("pwHint")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageState>
  );
}
