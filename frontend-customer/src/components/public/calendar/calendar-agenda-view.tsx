"use client";

import { CalendarOff } from "lucide-react";
import { groupEventsByDate, formatDateHeader } from "@/lib/calendar-utils";
import { EventCard } from "./event-card";
import type { CalendarEvent } from "@/types/live";

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  timezone: string;
}

export function CalendarAgendaView({
  events,
  timezone,
}: CalendarAgendaViewProps) {
  const grouped = groupEventsByDate(events, timezone);
  const sortedKeys = Array.from(grouped.keys()).sort();

  if (sortedKeys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <CalendarOff className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-semibold">No upcoming events</p>
        <p className="text-sm">Check back later for new classes and events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sortedKeys.map((dateKey) => {
        const dayEvents = grouped.get(dateKey)!;
        const header = formatDateHeader(dateKey);
        const date = new Date(dateKey + "T00:00:00");
        const weekday = date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });

        return (
          <section key={dateKey}>
            <div className="flex justify-between items-baseline mb-4">
              <h2 className="text-2xl font-bold tracking-tight">{header}</h2>
              {header !== weekday && (
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {weekday}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {dayEvents.map((event) => (
                <EventCard
                  key={`${event.type}-${event.id}`}
                  event={event}
                  timezone={timezone}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
