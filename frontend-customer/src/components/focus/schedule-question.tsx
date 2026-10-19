"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";

import { SchedulePicker } from "@/components/setup-flow/schedule-picker";
import { Button } from "@/components/ui/button";
import { defaultSchedule, scheduleValid } from "@/lib/interview";
import type { Schedule, ScheduleMode } from "@/lib/setup-flow";

// The /setup picker reads the setup shell's tokens; here they are the studio's.
const TOKENS = {
  "--sf-ink": "var(--foreground)",
  "--sf-paper": "var(--background)",
  "--sf-tint": "var(--muted)",
  "--sf-graphite": "var(--muted-foreground)",
  "--sf-brass-soft": "var(--ring)",
} as CSSProperties;

/** "When is it?" in focus mode: the /setup schedule picker, once or weekly,
 *  in her site's time zone (G13). Its answer is a tap: the schedule as
 *  `interview_schedule` reads it (JSON), never sent to a model. */
export function ScheduleQuestion({
  value = null,
  onAnswer,
  timezone,
  sending,
}: {
  /** Where the picker starts; null: a week from now (once) or next Monday (weekly). */
  value?: (Schedule & { mode: ScheduleMode }) | null;
  onAnswer: (json: string) => void;
  timezone?: string;
  sending: boolean;
}) {
  const t = useTranslations("admin");
  const [mode, setMode] = useState<ScheduleMode>(value?.mode ?? "recurring");
  const [schedule, setSchedule] = useState<Schedule>(
    () => value ?? defaultSchedule(mode),
  );
  const switchTo = (next: ScheduleMode) => {
    setMode(next);
    setSchedule(defaultSchedule(next));
  };
  return (
    <div
      className="flex flex-col gap-3 [&_button[aria-pressed=false]]:bg-background [&_input]:bg-background"
      style={TOKENS}
    >
      <div className="flex gap-2">
        {(["once", "recurring"] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? "default" : "outline"}
            aria-pressed={mode === m}
            disabled={sending}
            onClick={() => switchTo(m)}
          >
            {t(m === "once" ? "focus.once" : "focus.weekly")}
          </Button>
        ))}
      </div>
      <SchedulePicker
        key={mode}
        mode={mode}
        value={schedule}
        zone={timezone}
        onChange={setSchedule}
        disabled={sending}
        className="bg-background"
      />
      <Button
        className="self-start"
        loading={sending}
        disabled={!scheduleValid(mode, schedule)}
        onClick={() => onAnswer(JSON.stringify({ mode, ...schedule }))}
      >
        {t("focus.useSchedule")}
      </Button>
    </div>
  );
}
