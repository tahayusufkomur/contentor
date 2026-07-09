"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AutopilotSettings,
  getAutopilot,
  updateAutopilot,
} from "@/lib/blog-api";

const WEEKDAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

export function AutopilotCard({ eligible }: { eligible: boolean }) {
  const t = useTranslations("admin");
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);

  useEffect(() => {
    if (!eligible) return;
    getAutopilot()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [eligible]);

  const save = async (patch: Partial<AutopilotSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const saved = await updateAutopilot(patch);
      setSettings(saved);
    } catch {
      toast.error(t("blog.errGeneric"));
      setSettings(settings);
    }
  };

  if (!eligible || !settings) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("blog.autopilotTitle")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("blog.autopilotHint")}
          </p>
        </div>
        <Switch
          checked={settings.is_enabled}
          onCheckedChange={(checked) => save({ is_enabled: checked })}
        />
      </CardHeader>
      {settings.is_enabled && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Select
              value={settings.frequency}
              onValueChange={(v) => save({ frequency: v as "weekly" | "monthly" })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{t("blog.frequencyWeekly")}</SelectItem>
                <SelectItem value="monthly">{t("blog.frequencyMonthly")}</SelectItem>
              </SelectContent>
            </Select>

            {settings.frequency === "weekly" ? (
              <div className="flex gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => save({ weekday: d.value })}
                    className={`rounded-md px-2 py-1 text-xs ${
                      settings.weekday === d.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            ) : (
              <Select
                value={String(settings.day_of_month ?? 1)}
                onValueChange={(v) => save({ day_of_month: Number(v) })}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <input
              type="time"
              value={settings.generate_time?.slice(0, 5) ?? "09:00"}
              onChange={(e) => save({ generate_time: e.target.value })}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="autopilot-publish-mode"
                checked={!settings.auto_publish}
                onChange={() => save({ auto_publish: false })}
              />
              {t("blog.autopilotReview")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="autopilot-publish-mode"
                checked={settings.auto_publish}
                onChange={() => save({ auto_publish: true })}
              />
              {t("blog.autopilotPublish")}
            </label>
          </div>

          {settings.next_run_at && (
            <p className="text-xs text-muted-foreground">
              {t("blog.nextRun", {
                date: new Date(settings.next_run_at).toLocaleString(),
              })}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
