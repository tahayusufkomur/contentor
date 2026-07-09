"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  SetupAssistantPanel,
  type AssistantTab,
} from "@/components/setup/setup-assistant-panel";
import { useHelpBotStatus } from "@/lib/help-bot";
import { useSetupStatus } from "@/lib/setup-assistant";

/** Always-on floating entry point, /admin pages only (the tenant site's
 *  bottom-right corner belongs to the EditButton). While setup is running it
 *  shows the progress ring; once the checklist is done or dismissed it stays
 *  as a "?" so Ask Contentor remains one click away. */
export function SetupAssistantBubble() {
  const t = useTranslations("admin");
  const status = useSetupStatus();
  const helpStatus = useHelpBotStatus();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AssistantTab>("checklist");

  if (!status) return null;
  const { done, total } = status.progress;
  const checklistGone =
    status.dismissed || (total > 0 && done === total && !open);
  // Help chat is configured unless the status endpoint says the feature is
  // off entirely (caps still show the tab with a friendly message).
  const helpConfigured =
    !helpStatus || helpStatus.enabled || helpStatus.reason !== "disabled";

  if (checklistGone && !helpConfigured) return null;

  const openPanel = (nextTab: AssistantTab) => {
    setTab(nextTab);
    setOpen(true);
  };

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? done / total : 0;

  return (
    <>
      {checklistGone ? (
        <button
          type="button"
          aria-label={t("setup.help.bubbleLabel")}
          onClick={() => openPanel("help")}
          className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        >
          <HelpCircle className="h-5 w-5 text-primary" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={t("setup.bubbleLabel")}
          onClick={() => openPanel("checklist")}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border bg-background py-2 pl-2 pr-4 text-sm font-medium shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        >
          <span className="relative flex h-9 w-9 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                strokeWidth="3"
                className="stroke-muted"
              />
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                className="stroke-primary transition-all"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
              />
            </svg>
          </span>
          <span>
            {done}/{total}
          </span>
        </button>
      )}
      <SetupAssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        initialTab={tab}
      />
    </>
  );
}
