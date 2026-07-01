"use client";

import { useEffect, useState } from "react";
import { Mail, Save } from "lucide-react";
import { toast } from "sonner";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getSettings, saveSettings } from "@/lib/mailbox";
import type { MailboxSettings } from "@/lib/mailbox";

const LOCAL_PART_RE = /^[a-zA-Z0-9._-]+$/;

export function MailboxSettingsSection() {
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [localPart, setLocalPart] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setLocalPart(s.local_part || "info");
        setEnabled(s.enabled);
      })
      .catch(() => toast.error("Could not load mailbox settings."));
  }, []);

  function handleLocalPartChange(value: string) {
    setLocalPart(value);
    if (!value) {
      setValidationError("Email prefix cannot be empty.");
    } else if (!LOCAL_PART_RE.test(value)) {
      setValidationError(
        "Only letters, numbers, dots, hyphens, and underscores are allowed."
      );
    } else {
      setValidationError(null);
    }
  }

  const isUnchanged =
    settings !== null &&
    localPart === settings.local_part &&
    enabled === settings.enabled;

  const canSave =
    !saving &&
    !validationError &&
    localPart.length > 0 &&
    !isUnchanged;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const updated = await saveSettings({ local_part: localPart, enabled });
      setSettings(updated);
      setLocalPart(updated.local_part);
      setEnabled(updated.enabled);
      toast.success("Mailbox settings saved.");
    } catch {
      toast.error("Failed to save mailbox settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="max-w-lg">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // No custom domain: show upsell, disable controls
  if (!settings.has_custom_domain) {
    return (
      <div className="max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Mailbox
            </CardTitle>
            <CardDescription>
              Set a custom email address for your coaching space.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed p-4 space-y-2">
              <p className="text-sm font-medium">
                You&apos;re currently sending from:
              </p>
              <p className="text-sm font-mono text-muted-foreground">
                {settings.from_email}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Buy a custom domain to get your own email address — like{" "}
              <span className="font-mono">info@yourdomain.com</span>. Contact
              support or visit your billing page to add a custom domain to your
              plan.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Has custom domain: show address picker + enable toggle
  const previewAddress =
    localPart && !validationError
      ? `${localPart}@${settings.domain}`
      : `...@${settings.domain}`;

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Mailbox
          </CardTitle>
          <CardDescription>
            Choose your email address and enable your inbox to receive messages
            from students.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Address picker */}
          <div className="space-y-2">
            <Label htmlFor="local-part">Your email address</Label>
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
                Your students will see:{" "}
                <span className="font-mono font-medium">{previewAddress}</span>
              </p>
            )}
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="mailbox-enabled" className="text-sm font-medium">
                Enable inbox
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, students can send messages to your address.
              </p>
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
                Active address:{" "}
                <span className="font-mono font-medium">
                  {settings.from_email}
                </span>
              </p>
            </div>
          )}

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={!canSave}
            loading={saving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
