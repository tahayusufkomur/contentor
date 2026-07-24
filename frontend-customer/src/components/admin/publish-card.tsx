"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Circle,
  Copy,
  ExternalLink,
  Globe,
  KeyRound,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import { useSetupStatus } from "@/lib/setup-assistant";
import { ApiError } from "@/types/api";

// Copy + deep link for each mandatory publish requirement (decision
// 2026-07-05). Keys mirror the backend `publish_blockers` output.
const PUBLISH_BLOCKER_META: Record<string, { label: string; href: string }> = {
  look: { label: "Add your logo", href: "/admin/design" },
  demo_cleanup: {
    label: "Remove the demo content",
    href: "/admin/courses",
  },
  first_course: {
    label: "Create your first course or download",
    href: "/admin/courses/new",
  },
  payouts: {
    label: "Connect payments to sell paid content",
    href: "/admin/payouts",
  },
};

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
function patchErrorToast(err: unknown) {
  if (
    err instanceof ApiError &&
    err.data?.detail === "publish_requirements_unmet"
  ) {
    toast.error("Finish the required setup steps before publishing.");
  } else {
    toast.error("Something went wrong. Please try again.");
  }
}

export function PublishCard() {
  const [tenant, setTenant] = useState<MeTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pw, setPw] = useState("");
  const status = useSetupStatus();
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
      toast.success("Your app is live 🎉");
    },
    { onError: patchErrorToast },
  );

  const { run: unpublish, loading: unpublishing } = useAsyncAction(
    async () => {
      if (
        !window.confirm(
          "Your site will be hidden from students until you publish again.",
        )
      )
        return;
      await patchTenant({ is_published: false });
    },
    { onError: patchErrorToast },
  );

  const { run: savePassword, loading: savingPassword } = useAsyncAction(
    async () => {
      const value = pw.trim();
      if (!value) return;
      await patchTenant({ preview_password: value });
      setPw("");
      toast.success("Preview password saved");
    },
    { onError: patchErrorToast },
  );

  const { run: clearPassword, loading: clearingPassword } = useAsyncAction(
    async () => {
      await patchTenant({ preview_password: "" });
      toast.success("Preview password cleared");
    },
    { onError: patchErrorToast },
  );

  function copyLink() {
    if (!tenant) return;
    void navigator.clipboard?.writeText(tenant.studio_url);
    toast.success("Link copied");
  }

  function copyInstallGuide() {
    if (!tenant) return;
    void navigator.clipboard?.writeText(`${tenant.studio_url}/install`);
    toast.success("Install-guide link copied");
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
      {tenant && (
        <Card
          id="publish-card"
          className={
            tenant.is_published ? "" : "border-amber-500/40 bg-amber-500/10"
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {tenant.is_published ? (
                <>
                  <Globe className="h-4 w-4 text-emerald-600" /> Your app is
                  live
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 text-amber-600" /> Publish your app
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.is_published ? (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-emerald-600">● Live</span> —
                  students can find and install your app.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <a
                      href={tenant.studio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View site
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={copyLink}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={copyInstallGuide}
                  >
                    <Copy className="h-3.5 w-3.5" /> Share install guide
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={unpublish}
                    loading={unpublishing}
                    loadingText="Unpublishing…"
                  >
                    Unpublish
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Your app is hidden behind a preview gate. Publish it to let
                  students find and install it.
                </p>
                {!canPublish && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="mb-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                      Finish these first to publish:
                    </p>
                    <ul className="space-y-1.5">
                      {blockers.map((key) => {
                        const meta = PUBLISH_BLOCKER_META[key];
                        if (!meta) return null;
                        return (
                          <li key={key}>
                            <Link
                              href={meta.href}
                              className="flex items-center gap-2 text-sm text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                            >
                              <Circle className="h-3.5 w-3.5 shrink-0" />
                              {meta.label}
                            </Link>
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
                  loadingText="Publishing…"
                  className="gap-2"
                  title={
                    canPublish
                      ? undefined
                      : "Finish the required setup steps to publish"
                  }
                >
                  <Rocket className="h-4 w-4" /> Publish app — go live
                </Button>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Preview link:</span>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    {tenant.studio_url}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2"
                    onClick={copyLink}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
              </>
            )}

            {/* Preview password */}
            <div className="space-y-2 border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" /> Preview password
                {tenant.has_preview_password ? " — set" : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder={
                    tenant.has_preview_password
                      ? "Change password"
                      : "Set a password"
                  }
                  className="h-9 w-48"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={savePassword}
                  disabled={!pw.trim()}
                  loading={savingPassword}
                  loadingText="Saving…"
                >
                  Save
                </Button>
                {tenant.has_preview_password && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearPassword}
                    loading={clearingPassword}
                    loadingText="Clearing…"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Share the preview link + password to let others see the site
                before you publish.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </PageState>
  );
}
