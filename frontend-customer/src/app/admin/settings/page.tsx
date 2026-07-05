"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Globe, Save, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import type { TenantConfig } from "@/types/tenant";
import { MailboxSettingsSection } from "@/components/admin/mailbox/mailbox-settings";
import { EraseDemoDialog } from "@/components/setup/erase-demo-dialog";
import { useDemoContent } from "@/lib/setup-assistant";

const COMMON_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
];

function DemoContentCard() {
  const t = useTranslations("admin");
  const demo = useDemoContent();
  const [eraseOpen, setEraseOpen] = useState(false);

  if (!demo?.present) return null;

  const counts = demo.counts;
  const summary = [
    counts.courses > 0 &&
      t("setup.erase.countCourses", { count: counts.courses }),
    counts.downloads > 0 &&
      t("setup.erase.countDownloads", { count: counts.downloads }),
    counts.live_events > 0 &&
      t("setup.erase.countLive", { count: counts.live_events }),
    counts.plans > 0 && t("setup.erase.countPlans", { count: counts.plans }),
    counts.bundles > 0 &&
      t("setup.erase.countBundles", { count: counts.bundles }),
    counts.videos > 0 && t("setup.erase.countVideos", { count: counts.videos }),
    counts.photos > 0 && t("setup.erase.countPhotos", { count: counts.photos }),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("setup.items.demo_cleanup.title")}
          </CardTitle>
          <CardDescription>{summary}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() => setEraseOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("setup.erase.confirm")}
          </Button>
        </CardContent>
      </Card>
      <EraseDemoDialog open={eraseOpen} onClose={() => setEraseOpen(false)} />
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clientFetch<TenantConfig>("/api/v1/admin/config/")
      .then(setConfig)
      .catch(console.error);
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await clientFetch("/api/v1/admin/config/", {
        method: "PATCH",
        body: JSON.stringify({ timezone: config.timezone }),
      });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full max-w-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your site&apos;s general settings.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Timezone
            </CardTitle>
            <CardDescription>
              All event times in the calendar will be displayed in this timezone
              for your students.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={config.timezone || "UTC"}
                onValueChange={(timezone) => setConfig({ ...config, timezone })}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Current selection: {config.timezone || "UTC"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DemoContentCard />

      <MailboxSettingsSection />
    </div>
  );
}
