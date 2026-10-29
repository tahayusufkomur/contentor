"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Save } from "lucide-react";
import { toast } from "sonner";

import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getSettings, savePlatformAddress, saveSettings } from "@/lib/mailbox";
import type { MailboxSettings } from "@/lib/mailbox";
import { ApiError } from "@/types/api";

const LOCAL_PART_RE = /^[a-zA-Z0-9._-]+$/;

/** The backend's reason codes for a refused claim: each has its own message. */
const CLAIM_ERRORS = [
  "taken",
  "reserved_local_part",
  "invalid_local_part",
  "upgrade_required",
  "feature_unavailable",
] as const;

export function MailboxSettingsSection() {
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
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
  }, [reloadKey]);

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<Skeleton className="h-48 w-full" />}
      className="max-w-lg"
    >
      {settings && (
        <MailboxSettingsBody
          settings={settings}
          onSettingsChange={setSettings}
        />
      )}
    </PageState>
  );
}

function MailboxSettingsBody({
  settings,
  onSettingsChange,
}: {
  settings: MailboxSettings;
  onSettingsChange: (settings: MailboxSettings) => void;
}) {
  const tr = useTranslations("admin.mailbox");
  const [localPart, setLocalPart] = useState(settings.local_part || "info");
  const [enabled, setEnabled] = useState(settings.enabled);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [platformPart, setPlatformPart] = useState(
    settings.platform_local_part,
  );
  const [platformError, setPlatformError] = useState<string | null>(null);

  function handlePlatformPartChange(value: string) {
    setPlatformPart(value);
    if (value && !LOCAL_PART_RE.test(value)) {
      setPlatformError(tr("onlyChars"));
    } else {
      setPlatformError(null);
    }
  }

  const { run: handleClaimPlatformAddress, loading: platformSaving } =
    useAsyncAction(
      async () => {
        const updated = await savePlatformAddress(platformPart);
        onSettingsChange(updated);
        setPlatformPart(updated.platform_local_part);
        toast.success(tr("emailSaved"));
      },
      {
        onError: (err) => {
          const detail =
            err instanceof ApiError ? String(err.data.detail ?? "") : "";
          setPlatformError(
            (CLAIM_ERRORS as readonly string[]).includes(detail)
              ? tr(`errors.${detail as (typeof CLAIM_ERRORS)[number]}`)
              : tr("saveFailed"),
          );
        },
      },
    );

  function handleLocalPartChange(value: string) {
    setLocalPart(value);
    if (!value) {
      setValidationError(tr("prefixEmpty"));
    } else if (!LOCAL_PART_RE.test(value)) {
      setValidationError(tr("onlyChars"));
    } else {
      setValidationError(null);
    }
  }

  const isUnchanged =
    localPart === settings.local_part && enabled === settings.enabled;

  const { run: handleSave, loading: saving } = useAsyncAction(
    async () => {
      const updated = await saveSettings({ local_part: localPart, enabled });
      onSettingsChange(updated);
      setLocalPart(updated.local_part);
      setEnabled(updated.enabled);
      toast.success(tr("settingsSaved"));
    },
    { errorToast: tr("settingsError") },
  );

  const canSave = !validationError && localPart.length > 0 && !isUnchanged;

  // No custom domain, but paid: let them claim `<x>@platform_domain`.
  if (!settings.has_custom_domain && settings.platform_eligible) {
    const claimed = settings.platform_local_part;
    const preview =
      platformPart && !platformError
        ? `${platformPart}@${settings.platform_domain}`
        : `...@${settings.platform_domain}`;
    const platformUnchanged = platformPart === claimed;
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {tr("yourAddress")}
            </CardTitle>
            <CardDescription>
              {tr("claimText", { domain: settings.platform_domain })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="platform-part">{tr("chooseAddress")}</Label>
              <div className="flex items-center gap-0">
                <Input
                  id="platform-part"
                  value={platformPart}
                  onChange={(e) => handlePlatformPartChange(e.target.value)}
                  placeholder="jane"
                  className="rounded-r-none border-r-0 flex-1"
                  aria-invalid={!!platformError}
                />
                <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
                  @{settings.platform_domain}
                </span>
              </div>
              {platformError ? (
                <p className="text-xs text-destructive" role="alert">
                  {platformError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {tr.rich("willSee", {
                    address: preview,
                    m: (chunks) => (
                      <span className="font-mono font-medium">{chunks}</span>
                    ),
                  })}
                </p>
              )}
            </div>

            {claimed && (
              <div className="rounded-lg bg-muted/50 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {tr.rich("active", {
                    email: settings.from_email,
                    m: (chunks) => (
                      <span className="font-mono font-medium">{chunks}</span>
                    ),
                  })}
                </p>
              </div>
            )}

            <Button
              onClick={handleClaimPlatformAddress}
              disabled={!!platformError || !platformPart || platformUnchanged}
              loading={platformSaving}
              loadingText={tr("saving")}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {tr("saveAddress")}
            </Button>

            <p className="text-xs text-muted-foreground">
              {tr.rich("customDomain", {
                m: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  // No custom domain and free plan: send-only, upsell to a paid plan.
  if (!settings.has_custom_domain) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {tr("title")}
          </CardTitle>
          <CardDescription>{tr("freeText")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 space-y-2">
            <p className="text-sm font-medium">{tr("sendingFrom")}</p>
            <p className="text-sm font-mono text-muted-foreground">
              {settings.from_email}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{tr("upgradeText")}</p>
        </CardContent>
      </Card>
    );
  }

  // Has custom domain: show address picker + enable toggle
  const previewAddress =
    localPart && !validationError
      ? `${localPart}@${settings.domain}`
      : `...@${settings.domain}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {tr("title")}
        </CardTitle>
        <CardDescription>{tr("domainText")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Address picker */}
        <div className="space-y-2">
          <Label htmlFor="local-part">{tr("yourAddress")}</Label>
          <div className="flex items-center gap-0">
            <Input
              id="local-part"
              value={localPart}
              onChange={(e) => handleLocalPartChange(e.target.value)}
              placeholder="info"
              className="rounded-r-none border-r-0 flex-1"
              aria-invalid={!!validationError}
              aria-describedby={
                validationError ? "local-part-error" : "local-part-preview"
              }
            />
            <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
              @{settings.domain}
            </span>
          </div>
          {validationError ? (
            <p
              id="local-part-error"
              className="text-xs text-destructive"
              role="alert"
            >
              {validationError}
            </p>
          ) : (
            <p
              id="local-part-preview"
              className="text-xs text-muted-foreground"
            >
              {tr.rich("willSee", {
                address: previewAddress,
                m: (chunks) => (
                  <span className="font-mono font-medium">{chunks}</span>
                ),
              })}
            </p>
          )}
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="mailbox-enabled" className="text-sm font-medium">
              {tr("enable")}
            </Label>
            <p className="text-xs text-muted-foreground">{tr("enableText")}</p>
          </div>
          <Switch
            id="mailbox-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Current from_email info */}
        {settings.can_receive && (
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {tr.rich("active", {
                email: settings.from_email,
                m: (chunks) => (
                  <span className="font-mono font-medium">{chunks}</span>
                ),
              })}
            </p>
          </div>
        )}

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={!canSave}
          loading={saving}
          loadingText={tr("saving")}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {tr("saveChanges")}
        </Button>
      </CardContent>
    </Card>
  );
}
