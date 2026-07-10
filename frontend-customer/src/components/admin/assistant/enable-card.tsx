"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AssistantAdminConfig } from "@/lib/assistant";

/** Top card: the on/off switch that puts the chat bubble on the coach's
 * site, a small usage meter for the plan's monthly question cap, and the
 * handoff switch that lets visitors ask to talk to a human. */
export function EnableCard({
  config,
  onToggle,
  onToggleHandoff,
}: {
  config: AssistantAdminConfig;
  onToggle: (checked: boolean) => void;
  onToggleHandoff: (checked: boolean) => void;
}) {
  const t = useTranslations("admin");
  const { usage } = config;
  const pct =
    usage.questions_cap > 0
      ? Math.min(
          100,
          Math.round((usage.questions_used / usage.questions_cap) * 100),
        )
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("assistant.enable")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("assistant.enableHint")}
          </p>
        </div>
        <Switch checked={config.enabled} onCheckedChange={onToggle} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("assistant.usage", {
              used: usage.questions_used,
              cap: usage.questions_cap,
            })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <p className="text-sm font-medium">{t("assistant.handoff")}</p>
            <p className="text-xs text-muted-foreground">
              {t("assistant.handoffHint")}
            </p>
          </div>
          <Switch
            checked={config.human_handoff_enabled}
            onCheckedChange={onToggleHandoff}
          />
        </div>
      </CardContent>
    </Card>
  );
}
