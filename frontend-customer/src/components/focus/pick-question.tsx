"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { FocusOption } from "@/lib/focus/api";
import { pickAllAbove, pickAnswer, pickOrder } from "@/lib/focus/guide";
import { cn } from "@/lib/utils";

/** Several tiles to tick (what a membership includes), with Select all and
 *  Deselect all as /setup has them (above a long list). Her ticks go as ONE
 *  answer, a tap: the ticked values joined by commas, or `selectAll` once
 *  every tile is ticked. The tiles she opened with ticked come first. */
export function PickQuestion({
  options,
  ticked: initial = [],
  selectAll,
  sending,
  onTick,
  onAnswer,
  also,
}: {
  options: FocusOption[];
  /** Ticked when it opens (the items her words named). */
  ticked?: string[];
  /** The value that means every tile. */
  selectAll: string;
  sending: boolean;
  /** Her ticks as they change, before she sends them. */
  onTick?: (ticked: string[]) => void;
  onAnswer: (value: string) => void;
  /** A second way to send the same ticks (the access step's "Add a time limit"). */
  also?: { label: string; onAnswer: (value: string) => void };
}) {
  const t = useTranslations("admin.focus");
  const values = options.map((option) => option.value);
  const [ticked, setTickedState] = useState(() =>
    initial.filter((value) => values.includes(value)),
  );
  const setTicked = (next: string[]) => {
    setTickedState(next);
    onTick?.(next);
  };
  const every = ticked.length === values.length;
  const toggle = (value: string) =>
    setTicked(
      ticked.includes(value)
        ? ticked.filter((v) => v !== value)
        : [...ticked, value],
    );
  const all = values.length > 1 && (
    <Button
      size="sm"
      variant="ghost"
      disabled={sending}
      onClick={() => setTicked(every ? [] : values)}
    >
      {t(every ? "deselectAll" : "selectAll")}
    </Button>
  );
  const above = pickAllAbove(values.length);

  return (
    <div className="flex flex-col gap-3">
      {above && <div className="flex">{all}</div>}
      <div className="grid gap-2">
        {pickOrder(options, initial).map((option) => {
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
        {also && (
          <Button
            size="sm"
            variant="ghost"
            disabled={sending || ticked.length === 0}
            onClick={() => also.onAnswer(pickAnswer(values, ticked, selectAll))}
          >
            {also.label}
          </Button>
        )}
        {!above && all}
      </div>
    </div>
  );
}
