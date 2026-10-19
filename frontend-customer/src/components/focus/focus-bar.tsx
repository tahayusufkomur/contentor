"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { stopActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import { leaveCreation, type FocusState } from "@/lib/focus/api";
import { focusTimeKey, KIND_ROUTES } from "@/lib/focus/kinds";
import {
  focusProgress,
  refreshFocusOverview,
  saveFocusEdits,
  setActiveCreation,
} from "@/lib/focus/store";
import { cn } from "@/lib/utils";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

/** The top bar while she makes something in focus mode: what it is, how far
 *  along, and Save & leave (it stays open; reopening its page resumes it). */
export function FocusBar({ state }: { state: FocusState }) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const { done, total } = focusProgress(state);
  const timeKey = focusTimeKey(state.kind);
  const { run: leave, loading } = useAsyncAction(async () => {
    await saveFocusEdits(); // a failed save stays here, with its error
    if (state.id)
      await leaveCreation(state.id, { active_ms: takeActiveMs(timeKey) });
    stopActiveTime(timeKey);
    setActiveCreation(null);
    void refreshFocusOverview();
    navigate(KIND_ROUTES[state.kind]?.listHref ?? "/admin");
  });
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="truncate text-sm font-semibold text-foreground">
        {t(`focus.kinds.${state.kind}.new`)}
      </span>
      {total > 0 && (
        <span
          role="img"
          aria-label={t("focus.progress", { done, total })}
          className="flex shrink-0 items-center gap-1"
        >
          {state.steps.map((step) => (
            <span
              key={step.id}
              className={cn(
                "size-1.5 rounded-full",
                step.done ? "bg-foreground" : "bg-border",
              )}
            />
          ))}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full"
        loading={loading}
        onClick={leave}
      >
        {t("focus.saveLeave")}
      </Button>
    </div>
  );
}
