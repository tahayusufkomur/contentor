"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";
import { useSetupStatus } from "@/lib/setup-assistant";

/** Always-on floating entry point, /admin pages only (the tenant site's
 *  bottom-right corner belongs to the EditButton). */
export function SetupAssistantBubble() {
  const t = useTranslations("admin");
  const status = useSetupStatus();
  const [open, setOpen] = useState(false);

  if (!status || status.dismissed) return null;
  const { done, total } = status.progress;
  if (total > 0 && done === total && !open) return null; // celebrated + closed → gone

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? done / total : 0;

  return (
    <>
      <button
        type="button"
        aria-label={t("setup.bubbleLabel")}
        onClick={() => setOpen(true)}
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
      <SetupAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
