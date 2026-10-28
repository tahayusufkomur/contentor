import type { CalendarEvent } from "@/types/live";

export function getMonthGridDates(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  // Shift to Monday-start: Sun=0 → offset 6, Mon=1 → offset 0, etc.
  const offset = startDay === 0 ? 6 : startDay - 1;
  const gridStart = new Date(year, month, 1 - offset);

  const dates: Date[] = [];
  const totalCells =
    offset + new Date(year, month + 1, 0).getDate() > 35 ? 42 : 35;
  for (let i = 0; i < totalCells; i++) {
    dates.push(
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
      ),
    );
  }
  return dates;
}

export function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1; // Monday start
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  return Array.from(
    { length: 7 },
    (_, i) =>
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Get the YYYY-MM-DD date key for an event in the given timezone.
 * This ensures events are grouped by their local date, not UTC date.
 */
function eventDateKey(dateStr: string, tz: string): string {
  const d = new Date(dateStr);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

export function groupEventsByDate(
  events: CalendarEvent[],
  tz: string = "UTC",
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = eventDateKey(event.scheduled_at, tz);
    const existing = map.get(key) || [];
    existing.push(event);
    map.set(key, existing);
  }
  return map;
}

export function getDateRangeParams(
  view: string,
  date: Date,
): { from: string; to: string } {
  if (view === "agenda") {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 30);
    return { from: toDateKey(from), to: toDateKey(to) };
  }
  // Month: include full grid range
  const grid = getMonthGridDates(date.getFullYear(), date.getMonth());
  return { from: toDateKey(grid[0]), to: toDateKey(grid[grid.length - 1]) };
}

export function formatMonthYear(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** Weekday names in the locale, Monday first (the calendar grid's order). */
export function weekdayNames(
  locale: string,
  width: "short" | "long",
): string[] {
  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: width,
    timeZone: "UTC",
  });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2024, 0, 1 + i))),
  );
}

/**
 * Format a time string using an explicit IANA timezone.
 * Both server and client will produce the same result.
 */
export function formatTime(
  dateStr: string,
  locale: string,
  tz: string = "UTC",
): string {
  return new Date(dateStr).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
}

/**
 * "Jul 18, 12:00 PM" for event cards. Locale and IANA timezone are explicit
 * so the server-rendered HTML and the client hydration produce identical
 * text (the process TZ/locale must never leak into public markup).
 */
export function formatEventWhen(
  dateStr: string,
  locale: string,
  tz: string = "UTC",
): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

export function formatDateHeader(dateStr: string, locale: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const relative = (days: number) => {
    const word = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(days, "day");
    return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
  };
  if (isSameDay(date, today)) return relative(0);
  if (isSameDay(date, tomorrow)) return relative(1);
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
