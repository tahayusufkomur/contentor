"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { NavLink } from "@/components/ui/nav-link";
import { SETUP_CATALOG } from "@/components/setup/catalog";
import { useAssistantDock } from "@/lib/assistant-dock";
import { patchSetup, useSetupStatus } from "@/lib/setup-assistant";

export function SetupGuideCard() {
  const t = useTranslations("admin");
  const status = useSetupStatus();
  const dock = useAssistantDock();

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
  const live = status.items.some((i) => i.key === "publish" && i.done);
  // Live with "sell later" items held: the one thing left is selling them.
  const held = live && !allDone ? (status.held ?? []) : [];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {allDone
                ? t("setup.celebrateTitle")
                : held.length
                  ? t("setup.titleSelling")
                  : live
                    ? t("setup.titleLive")
                    : t("setup.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {allDone
                ? t("setup.celebrateBody")
                : held.length
                  ? t("setup.heldIntro")
                  : t("setup.progressLabel", { done, total })}
            </p>
            {held.length > 0 && (
              <ul className="mt-1 text-sm">
                {held.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => dock.open("setup")}
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
          <ul className="-mx-2 space-y-0.5">
            {next.map((item) => {
              const entry = item.href
                ? { ...SETUP_CATALOG[item.key], href: item.href }
                : SETUP_CATALOG[item.key];
              const Icon = entry?.icon;
              const label = (
                <>
                  {Icon ? (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  ) : null}
                  {t(`setup.items.${item.key}.title`)}
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </>
              );
              const rowClass =
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent";
              return (
                <li key={item.key}>
                  {!entry?.href ? (
                    // Rows with an in-panel action (erase demo, copy link) run there.
                    <button
                      type="button"
                      onClick={() => dock.open("setup")}
                      className={rowClass}
                    >
                      {label}
                    </button>
                  ) : entry.hardNav ? (
                    <a href={entry.href} className={rowClass}>
                      {label}
                    </a>
                  ) : (
                    <NavLink href={entry.href} className={rowClass}>
                      {label}
                    </NavLink>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
