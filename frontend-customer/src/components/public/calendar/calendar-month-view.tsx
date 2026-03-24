"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Clock, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_CONFIG } from "@/lib/event-colors";
import {
  getMonthGridDates,
  isSameDay,
  isToday,
  toDateKey,
  groupEventsByDate,
  formatTime,
} from "@/lib/calendar-utils";
import type { CalendarEvent } from "@/types/live";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_EVENTS = 2;

interface CalendarMonthViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  timezone: string;
}

function getEventHref(event: CalendarEvent): string {
  return `/calendar/${event.type}/${event.id}`;
}

export function CalendarMonthView({ events, currentDate, timezone }: CalendarMonthViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const gridDates = getMonthGridDates(currentDate.getFullYear(), currentDate.getMonth());
  const eventsByDate = groupEventsByDate(events, timezone);
  const currentMonth = currentDate.getMonth();
  const rowCount = gridDates.length / 7;

  const selectedKey = toDateKey(selectedDate);
  const selectedEvents = eventsByDate.get(selectedKey) || [];

  const upcomingEvents = useMemo(() => {
    if (selectedEvents.length > 0) return [];
    const selTime = selectedDate.getTime();
    return events
      .filter((e) => new Date(e.scheduled_at).getTime() > selTime)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .slice(0, 3);
  }, [events, selectedDate, selectedEvents.length]);

  const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col md:flex-row rounded-xl border border-border overflow-hidden bg-card/50 md:min-h-[calc(100vh-240px)]">
      {/* LEFT: Calendar Grid */}
      <div className="md:w-[72%] md:border-r border-border flex flex-col">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="p-2 md:p-3 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells — grid rows expand to fill available height */}
        <div
          className="grid grid-cols-7 flex-1"
          style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
        >
          {gridDates.map((date, i) => {
            const key = toDateKey(date);
            const dayEvents = eventsByDate.get(key) || [];
            const inMonth = date.getMonth() === currentMonth;
            const today = isToday(date);
            const selected = isSameDay(date, selectedDate);
            const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "min-h-[60px] p-1 md:p-2 flex flex-col border-b border-r border-border transition-colors text-left relative",
                  !inMonth && "opacity-20",
                  inMonth && !hasEvents && !today && !selected && "opacity-45",
                  today && !selected && "bg-primary/5",
                  selected && "bg-primary/[0.07]",
                  !selected && !today && hasEvents && "hover:bg-primary/[0.04]"
                )}
              >
                {/* Selection ring */}
                {selected && (
                  <span className="absolute inset-[2px] border-2 border-primary/35 rounded-lg pointer-events-none" />
                )}

                {/* Day number */}
                <div className="mb-1">
                  {today ? (
                    <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {date.getDate()}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "text-xs",
                        selected ? "text-primary font-bold" : hasEvents ? "text-foreground font-bold" : "text-muted-foreground font-medium"
                      )}
                    >
                      {date.getDate()}
                    </span>
                  )}
                </div>

                {/* Event pills (desktop) */}
                <div className="hidden md:flex flex-col gap-0.5 mt-auto overflow-hidden">
                  {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event, ei) => {
                    const config = EVENT_TYPE_CONFIG[event.type];
                    return (
                      <div
                        key={`${event.type}-${event.id}-${ei}`}
                        className={cn(
                          "rounded px-1.5 py-[3px] text-[11px] leading-tight truncate border-l-[3px]",
                          config.borderClass,
                          config.bgClass
                        )}
                      >
                        <span className="font-semibold text-muted-foreground">
                          {formatTime(event.scheduled_at, timezone)}
                        </span>{" "}
                        <span className="text-foreground">{event.title}</span>
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="text-[10px] font-bold text-primary pl-1.5 mt-0.5">
                      +{overflow} more
                    </span>
                  )}
                </div>

                {/* Mobile dots */}
                <div className="flex md:hidden gap-1 mt-auto flex-wrap">
                  {dayEvents.map((event, ei) => {
                    const config = EVENT_TYPE_CONFIG[event.type];
                    return (
                      <span
                        key={`dot-${event.type}-${event.id}-${ei}`}
                        className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Detail Panel */}
      <div className="md:w-[28%] bg-muted/50 md:relative">
        <div className="p-4 md:p-6 md:absolute md:inset-0 md:overflow-y-auto">
          {/* Header */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">
              {isToday(selectedDate) ? "Today" : "Selected Day"}
            </p>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              {selectedDateLabel}
            </h3>
          </div>

          {selectedEvents.length > 0 ? (
            <div className="space-y-3">
              {selectedEvents.map((event, i) => (
                <DetailEventCard key={`${event.type}-${event.id}-${i}`} event={event} timezone={timezone} />
              ))}
            </div>
          ) : (
            <>
              {/* Empty state */}
              <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center mb-6">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No events scheduled</p>
              </div>

              {/* Coming up next */}
              {upcomingEvents.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Coming up next
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-3">
                    {upcomingEvents.map((event, i) => (
                      <DetailEventCard
                        key={`upcoming-${event.type}-${event.id}-${i}`}
                        event={event}
                        timezone={timezone}
                        showDate
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Detail panel event card ── */

interface DetailEventCardProps {
  event: CalendarEvent;
  timezone: string;
  showDate?: boolean;
}

function DetailEventCard({ event, timezone, showDate }: DetailEventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.type];
  const timeStr = formatTime(event.scheduled_at, timezone);
  const endStr = event.ended_at ? formatTime(event.ended_at, timezone) : null;
  const href = getEventHref(event);

  const dateLabel = showDate
    ? new Date(event.scheduled_at).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card overflow-hidden shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
    >
      <div className="flex items-stretch">
        <div className={cn("w-1 shrink-0", config.dotClass)} />
        <div className="flex-1 p-4">
          {/* Type badge + price */}
          <div className="flex items-center justify-between mb-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                config.textClass,
                config.bgClass
              )}
            >
              {config.label}
            </span>
            <span
              className={cn(
                "text-xs font-bold",
                event.pricing_type === "free" ? "text-emerald-600" : "text-muted-foreground"
              )}
            >
              {event.pricing_type === "free" ? "Free" : event.price}
            </span>
          </div>

          {/* Title */}
          <h4 className="font-bold text-sm text-foreground leading-snug mb-1.5">
            {event.title}
          </h4>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {dateLabel && <>{dateLabel} &middot; </>}
              {timeStr}
              {endStr && ` — ${endStr}`}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
