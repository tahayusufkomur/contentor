"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { SETUP_CATALOG } from "@/components/setup/catalog";
import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";
import { patchSetup, useSetupStatus } from "@/lib/setup-assistant";

export function SetupGuideCard() {
  const t = useTranslations("admin");
  const status = useSetupStatus();
  const [open, setOpen] = useState(false);

  if (!status) return null;

  if (status.dismissed) {
    return (
      <button
        type="button"
        onClick={() => void patchSetup({ dismissed: false })}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t("setup.show")}
      </button>
    );
  }

  const { done, total } = status.progress;
  const next = status.items.filter((i) => !i.optional && !i.done).slice(0, 3);
  const allDone = done === total;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {allDone ? t("setup.celebrateTitle") : t("setup.title")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {allDone
                  ? t("setup.celebrateBody")
                  : t("setup.progressLabel", { done, total })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              {t("setup.openFull")}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
            />
          </div>
          {!allDone && (
            <ul className="space-y-1">
              {next.map((item) => {
                const Icon = SETUP_CATALOG[item.key]?.icon;
                return (
                  <li
                    key={item.key}
                    className="flex items-center gap-2 text-sm"
                  >
                    {Icon ? (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    ) : null}
                    {t(`setup.items.${item.key}.title`)}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SetupAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
