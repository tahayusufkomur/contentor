"use client";

import Link from "next/link";
import { MapPin, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_CONFIG } from "@/lib/event-colors";
import { formatTime } from "@/lib/calendar-utils";
import type { CalendarEvent } from "@/types/live";

interface EventCardProps {
  event: CalendarEvent;
  compact?: boolean;
  timezone?: string;
}

function getEventHref(event: CalendarEvent): string {
  return `/calendar/${event.type}/${event.id}`;
}

export function EventCard({ event, compact = false, timezone = "UTC" }: EventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.type];
  const isLive = event.status === "live" || event.status === "ongoing";
  const isPast = event.status === "ended";

  const timeStr = formatTime(event.scheduled_at, timezone);
  const endStr = event.ended_at ? formatTime(event.ended_at, timezone) : null;
  const href = getEventHref(event);

  if (compact) {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-lg border-l-4 bg-card p-2 transition-transform hover:scale-[1.02] cursor-pointer",
          config.borderClass,
          isPast && "opacity-50"
        )}
      >
        <span className={cn("block text-[10px] font-bold uppercase tracking-wider", config.textClass)}>
          {timeStr}
        </span>
        <p className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate">
          {event.title}
        </p>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-stretch rounded-2xl bg-card overflow-hidden transition-all hover:shadow-md group",
        isPast && "opacity-50"
      )}
    >
      <div className={cn("w-1.5 shrink-0", config.dotClass)} />
      <div className="flex-1 p-4">
        <div className="flex justify-between items-start mb-1.5">
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
              config.textClass,
              config.bgClass
            )}
          >
            {config.label}
          </span>
          {isLive && (
            <div className="flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-destructive animate-pulse" />
              <span className="text-[10px] font-bold text-destructive uppercase">Live</span>
            </div>
          )}
        </div>
        <h3 className="font-semibold text-foreground leading-tight mb-1">
          {event.title}
        </h3>
        <div className="flex justify-between items-end">
          <div className="space-y-0.5">
            <p className="text-sm text-muted-foreground">
              {timeStr}{endStr ? ` — ${endStr}` : ""}
            </p>
            {event.location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.location}
              </p>
            )}
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {event.pricing_type === "free" ? "Free" : `${event.price}`}
          </span>
        </div>
      </div>
    </Link>
  );
}
