"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { FocusOption } from "@/lib/focus/api";
import { pickAnswer } from "@/lib/focus/guide";
import { cn } from "@/lib/utils";

/** Several tiles to tick (what a membership includes), with Select all and
 *  Deselect all as /setup has them. Her ticks go as ONE answer, a tap: the
 *  ticked values joined by commas, or `selectAll` once every tile is ticked. */
export function PickQuestion({
  options,
  ticked: initial = [],
  selectAll,
  sending,
  onAnswer,
}: {
  options: FocusOption[];
  /** Ticked when it opens (the items her words named). */
  ticked?: string[];
  /** The value that means every tile. */
  selectAll: string;
  sending: boolean;
  onAnswer: (value: string) => void;
}) {
  const t = useTranslations("admin.focus");
  const values = options.map((option) => option.value);
  const [ticked, setTicked] = useState(() =>
    initial.filter((value) => values.includes(value)),
  );
  const every = ticked.length === values.length;
  const toggle = (value: string) =>
    setTicked((now) =>
      now.includes(value) ? now.filter((v) => v !== value) : [...now, value],
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2">
        {options.map((option) => {
          const on = ticked.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              disabled={sending}
              onClick={() => toggle(option.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60",
                on
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input",
                )}
              >
                {on && <Check className="size-3" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {option.label}
                </span>
                {option.hint && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={sending}
          disabled={ticked.length === 0}
          onClick={() => onAnswer(pickAnswer(values, ticked, selectAll))}
        >
          {ticked.length === 0
            ? t("pickSome")
            : t("continueWith", { count: ticked.length })}
        </Button>
        {values.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={sending}
            onClick={() => setTicked(every ? [] : values)}
          >
            {t(every ? "deselectAll" : "selectAll")}
          </Button>
        )}
      </div>
    </div>
  );
}
