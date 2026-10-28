"use client";

import { useLocale } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  buyPill,
  freePill,
  linkPill,
  spanText,
  type Window,
} from "@/lib/access/ways";

export type WindowMode = "buy" | "plan" | "free";

const PRESETS = [7, 30, 90, 180, 365];
const PILL = { buy: buyPill, plan: linkPill, free: freePill };

/** Today plus `n` days, as the YYYY-MM-DD a date field holds. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A window without its unset fields; no fields at all is no window. */
function clean(w: Window): Window | null {
  const out = Object.fromEntries(
    Object.entries(w).filter(([, v]) => v !== undefined),
  ) as Window;
  return Object.keys(out).length ? out : null;
}

function Opt({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-md border bg-background px-2.5 py-1 text-xs hover:border-foreground",
        on && "border-primary font-medium ring-1 ring-primary",
      )}
    >
      {children}
    </button>
  );
}

/** A number of days typed by hand; what is half typed stays in the box. */
function DaysInput({
  days,
  onChange,
  onBad,
}: {
  days: number;
  onChange: (days: number) => void;
  /** Whether the box holds something that is not a day count (until it goes away). */
  onBad?: (bad: boolean) => void;
}) {
  const [text, setText] = useState(String(days));
  const n = Number(text);
  const bad = !Number.isInteger(n) || n < 1 || n > 3650;
  const tell = useRef(onBad);
  tell.current = onBad;
  useEffect(() => {
    tell.current?.(bad);
    return () => tell.current?.(false);
  }, [bad]);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={3650}
        value={text}
        aria-label="Number of days"
        aria-invalid={bad}
        className="h-8 w-20"
        onChange={(e) => {
          setText(e.target.value);
          const next = Number(e.target.value);
          if (Number.isInteger(next) && next >= 1 && next <= 3650)
            onChange(next);
        }}
      />
      {bad && <span className="text-xs text-destructive">1 to 3650 days</span>}
    </span>
  );
}

/**
 * One end of a window: nothing, a preset or typed number of days, or a date.
 * Only one of days and date is ever set.
 */
function Bound({
  label,
  none,
  presets = [],
  daysLabel,
  daysSuffix,
  dateLabel,
  days,
  date,
  onChange,
  onBad,
}: {
  label: string;
  none?: string;
  presets?: number[];
  daysLabel: string;
  daysSuffix: string;
  dateLabel: string;
  days?: number;
  date?: string;
  onChange: (next: { days?: number; date?: string }) => void;
  onBad?: (bad: boolean) => void;
}) {
  const [custom, setCustom] = useState(false);
  const key =
    date !== undefined
      ? "date"
      : days === undefined
        ? "none"
        : !custom && presets.includes(days)
          ? `p${days}`
          : "custom";
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {none && (
          <Opt on={key === "none"} onClick={() => onChange({})}>
            {none}
          </Opt>
        )}
        {presets.map((p) => (
          <Opt
            key={p}
            on={key === `p${p}`}
            onClick={() => {
              setCustom(false);
              onChange({ days: p });
            }}
          >
            {spanText(p)}
          </Opt>
        ))}
        <Opt
          on={key === "custom"}
          onClick={() => {
            setCustom(true);
            onChange({ days: days ?? 14 });
          }}
        >
          {daysLabel}
        </Opt>
        <Opt
          on={key === "date"}
          onClick={() => onChange({ date: date ?? inDays(30) })}
        >
          {dateLabel}
        </Opt>
        {key === "custom" && days !== undefined && (
          <span className="inline-flex items-center gap-1.5">
            <DaysInput
              days={days}
              onChange={(d) => onChange({ days: d })}
              onBad={onBad}
            />
            <span className="text-xs text-muted-foreground">{daysSuffix}</span>
          </span>
        )}
        {key === "date" && (
          <Input
            type="date"
            value={date ?? ""}
            aria-label={dateLabel}
            className="h-8 w-40"
            onChange={(e) => onChange({ date: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

/** The four free modes; the window holds only the fields each one needs. */
function FreePanel({
  value,
  onChange,
  onBad,
}: {
  value: Window | null;
  onChange: (w: Window | null) => void;
  onBad: (bad: boolean) => void;
}) {
  const w = value ?? {};
  const mode =
    w.closes_after_days !== undefined
      ? "first"
      : w.opens_on !== undefined
        ? "between"
        : w.closes_on !== undefined
          ? "until"
          : value
            ? "between"
            : "always";
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Opt on={mode === "always"} onClick={() => onChange(null)}>
          Always
        </Opt>
        <Opt
          on={mode === "until"}
          onClick={() => onChange({ closes_on: w.closes_on ?? inDays(30) })}
        >
          Until a date
        </Opt>
        <Opt
          on={mode === "between"}
          onClick={() =>
            onChange({
              opens_on: w.opens_on ?? inDays(0),
              closes_on: w.closes_on ?? inDays(30),
            })
          }
        >
          Between two dates
        </Opt>
        <Opt
          on={mode === "first"}
          onClick={() =>
            onChange({ closes_after_days: w.closes_after_days ?? 7 })
          }
        >
          First days after joining
        </Opt>
      </div>
      {mode === "until" && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Free until
          <Input
            type="date"
            value={w.closes_on ?? ""}
            className="h-8 w-40"
            onChange={(e) => onChange({ closes_on: e.target.value })}
          />
        </label>
      )}
      {mode === "between" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            value={w.opens_on ?? ""}
            aria-label="Free from"
            className="h-8 w-40"
            onChange={(e) =>
              onChange({ opens_on: e.target.value, closes_on: w.closes_on })
            }
          />
          to
          <Input
            type="date"
            value={w.closes_on ?? ""}
            aria-label="Free to"
            className="h-8 w-40"
            onChange={(e) =>
              onChange({ opens_on: w.opens_on, closes_on: e.target.value })
            }
          />
        </div>
      )}
      {mode === "first" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          For the first
          <DaysInput
            days={w.closes_after_days ?? 7}
            onChange={(d) => onChange({ closes_after_days: d })}
            onBad={onBad}
          />
          days after someone joins the site
        </div>
      )}
    </>
  );
}

/**
 * One way's timing: a pill that says it in words and opens a panel to change
 * it. `value` null is no window at all (always open).
 */
export function WindowEditor({
  mode,
  label,
  value,
  onChange,
  note,
  onInvalid,
}: {
  mode: WindowMode;
  /** The word beside the pill, such as "Members get it". */
  label: string;
  value: Window | null;
  onChange: (next: Window | null) => void;
  /** A line under the panel. */
  note?: string;
  /** Whether a box holds a day count or date that is not a valid one. */
  onInvalid?: (invalid: boolean) => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [badBoxes, setBadBoxes] = useState<Record<string, boolean>>({});
  const bad = (box: string) => (b: boolean) =>
    setBadBoxes((prev) => (!!prev[box] === b ? prev : { ...prev, [box]: b }));
  const w = value ?? {};
  // A cleared date field leaves "" in the window, which no one can save.
  const emptyDate = [w.opens_on, w.closes_on].some((d) => d === "");
  const invalid = emptyDate || Object.values(badBoxes).some(Boolean);
  const tell = useRef(onInvalid);
  tell.current = onInvalid;
  useEffect(() => {
    tell.current?.(invalid);
    return () => tell.current?.(false);
  }, [invalid]);
  const set = (patch: Window) => onChange(clean({ ...w, ...patch }));
  const opens = (n: { days?: number; date?: string }) =>
    set({ opens_after_days: n.days, opens_on: n.date });
  const closes = (n: { days?: number; date?: string }) =>
    set({ closes_after_days: n.days, closes_on: n.date });
  const presale = w.opens_after_days !== undefined || w.opens_on !== undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pl-3 pr-2.5 text-xs hover:border-foreground"
        >
          {PILL[mode](value, locale)}
          <ChevronDown
            className={cn(
              "h-3 w-3 opacity-60 motion-safe:transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {open && (
        <div className="mt-2.5 grid gap-3 rounded-lg border bg-muted/50 p-3">
          {mode === "buy" && (
            <>
              <Bound
                label="Access"
                none="Forever"
                presets={PRESETS}
                daysLabel="Custom days"
                daysSuffix="days from the day they buy"
                dateLabel="Until a date"
                days={w.closes_after_days}
                date={w.closes_on}
                onChange={closes}
                onBad={bad("closes")}
              />
              {presale ? (
                <div className="grid gap-1.5">
                  <Bound
                    label="It opens"
                    daysLabel="A while after they buy"
                    daysSuffix="days after they buy"
                    dateLabel="On a date"
                    days={w.opens_after_days}
                    date={w.opens_on}
                    onChange={opens}
                    onBad={bad("opens")}
                  />
                  <button
                    type="button"
                    className="w-fit text-xs underline underline-offset-2"
                    onClick={() => opens({})}
                  >
                    Opens right away
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-fit text-xs underline underline-offset-2"
                  onClick={() => opens({ days: 7 })}
                >
                  It opens later (a pre-sale)
                </button>
              )}
            </>
          )}
          {mode === "plan" && (
            <>
              <Bound
                label="Opens"
                none="Right away"
                daysLabel="After a wait"
                daysSuffix="days of membership"
                dateLabel="On a date"
                days={w.opens_after_days}
                date={w.opens_on}
                onChange={opens}
                onBad={bad("opens")}
              />
              <Bound
                label="Closes"
                none="Never"
                daysLabel="After a time"
                daysSuffix="days from joining"
                dateLabel="On a date"
                days={w.closes_after_days}
                date={w.closes_on}
                onChange={closes}
                onBad={bad("closes")}
              />
            </>
          )}
          {mode === "free" && (
            <FreePanel value={value} onChange={onChange} onBad={bad("free")} />
          )}
          {emptyDate && (
            <div role="alert" className="text-xs text-destructive">
              Pick a date.
            </div>
          )}
          {note && <div className="text-xs text-muted-foreground">{note}</div>}
        </div>
      )}
    </div>
  );
}
