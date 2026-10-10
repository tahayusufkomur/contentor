"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { browserTimeZone, scheduleSummary } from "@/lib/interview";
import type { Schedule, ScheduleMode, ScheduleSlot } from "@/lib/setup-flow";
import { cn } from "@/lib/utils";

// Monday first, as a weekly timetable reads.
const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];
const INPUT =
  "h-10 rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 text-[14px] text-[var(--sf-ink)] outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50";
const NEW_SLOT: ScheduleSlot = { days: [], times: [""] };

/** Every timezone the browser knows, the coach's own first when it is not on the list. */
function timeZones(current: string): string[] {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  const all = intl.supportedValuesOf?.("timeZone") ?? [];
  return all.includes(current) ? all : [current, ...all];
}

/** When a class runs, with the browser's own pickers: a single date and time,
 * or a weekly timetable (start, optional end, then one or more slots of days
 * and times) in the coach's timezone. The caller owns the value; a summary
 * line reads it back. */
export function SchedulePicker({
  mode,
  value,
  onChange,
  disabled,
  className,
}: {
  mode: ScheduleMode;
  value: Schedule;
  onChange: (s: Schedule) => void;
  disabled: boolean;
  className?: string;
}) {
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  const slots = value.slots?.length ? value.slots : [NEW_SLOT];
  const setSlot = (i: number, patch: Partial<ScheduleSlot>) =>
    set({ slots: slots.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)) });
  const zone = value.tz || browserTimeZone();
  const summary = scheduleSummary(mode, value);
  const ready = slots.every(
    (sl) => sl.days.length > 0 && sl.times.some(Boolean),
  );
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--sf-line)] bg-white p-4 sm:p-5",
        className,
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "once" ? (
          <Field label="Date and time" className="sm:col-span-2">
            <input
              type="datetime-local"
              value={value.at ?? ""}
              disabled={disabled}
              onChange={(e) => set({ at: e.target.value })}
              className={INPUT}
            />
          </Field>
        ) : (
          <>
            <Field label="Starts">
              <input
                type="date"
                value={value.start ?? ""}
                disabled={disabled}
                onChange={(e) => set({ start: e.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Ends" hint="Leave empty to keep going">
              <input
                type="date"
                value={value.end ?? ""}
                min={value.start}
                disabled={disabled}
                onChange={(e) => set({ end: e.target.value })}
                className={INPUT}
              />
            </Field>
          </>
        )}
        <Field label="Time zone" className="sm:col-span-2">
          <select
            value={zone}
            disabled={disabled}
            onChange={(e) => set({ tz: e.target.value })}
            className={INPUT}
          >
            {timeZones(zone).map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        {mode === "recurring" && (
          <>
            {slots.map((sl, i) => {
              const times = sl.times.length ? sl.times : [""];
              return (
                <section
                  key={i}
                  aria-label={`Class time ${i + 1}`}
                  className="grid gap-4 rounded-xl bg-[var(--sf-tint)] p-4 sm:col-span-2"
                >
                  {slots.length > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold">
                        Class time {i + 1}
                      </p>
                      <button
                        type="button"
                        aria-label="Remove this day and time"
                        disabled={disabled}
                        onClick={() =>
                          set({ slots: slots.filter((_, j) => j !== i) })
                        }
                        className="rounded-full p-1.5 text-[var(--sf-faint)] hover:bg-white hover:text-[var(--sf-ink)]"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  )}
                  <Field label="Days">
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS.map(([d, label]) => {
                        const on = sl.days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            disabled={disabled}
                            onClick={() =>
                              setSlot(i, {
                                days: on
                                  ? sl.days.filter((x) => x !== d)
                                  : [...sl.days, d],
                              })
                            }
                            className={cn(
                              "h-9 min-w-[52px] rounded-full border bg-white px-3 text-[13.5px] font-medium transition-colors disabled:opacity-50",
                              on
                                ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                                : "border-[var(--sf-line-strong)] hover:border-[var(--sf-ink)]",
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Times">
                    <div className="flex flex-wrap items-center gap-2">
                      {times.map((t, k) => (
                        <span key={k} className="flex items-center gap-1">
                          <input
                            type="time"
                            value={t}
                            disabled={disabled}
                            onChange={(e) =>
                              setSlot(i, {
                                times: times.map((x, j) =>
                                  j === k ? e.target.value : x,
                                ),
                              })
                            }
                            className={INPUT}
                          />
                          {times.length > 1 && (
                            <button
                              type="button"
                              aria-label="Remove this time"
                              disabled={disabled}
                              onClick={() =>
                                setSlot(i, {
                                  times: times.filter((_, j) => j !== k),
                                })
                              }
                              className="rounded-full p-1.5 text-[var(--sf-faint)] hover:bg-white hover:text-[var(--sf-ink)]"
                            >
                              <X className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </span>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={disabled || times.some((t) => !t)}
                        onClick={() => setSlot(i, { times: [...times, ""] })}
                        className="rounded-full"
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add a time
                      </Button>
                    </div>
                  </Field>
                </section>
              );
            })}
            <div className="sm:col-span-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || !ready}
                onClick={() => set({ slots: [...slots, NEW_SLOT] })}
                className="rounded-full"
              >
                <Plus className="size-3.5" aria-hidden />
                Add another day and time
              </Button>
            </div>
          </>
        )}
      </div>
      <p
        aria-live="polite"
        className={cn(
          "mt-4 text-[14px]",
          summary ? "text-[var(--sf-ink)]" : "text-[var(--sf-faint)]",
        )}
      >
        {summary ||
          (mode === "once"
            ? "Pick the date and time."
            : "Pick a start date, the days and a time.")}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium text-[var(--sf-graphite)]">
        {label}
        {hint && (
          <span className="font-normal text-[var(--sf-faint)]">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}
