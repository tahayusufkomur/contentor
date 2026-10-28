"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Radio, Video } from "lucide-react";
import { CoverArt } from "@/components/covers/cover-art";
import { useTenant } from "@/hooks/use-tenant";
import { formatDateHeader, formatTime } from "@/lib/calendar-utils";
import { eventItem } from "@/lib/covers/items";
import { eventPriceLabel } from "@/components/sections/kit";
import type { CalendarEvent, CalendarEventType } from "@/types/live";
import { useLocale, useTranslations } from "next-intl";

const TYPE_META: Record<
  CalendarEventType,
  {
    labelKey:
      | "eventKind.liveSession"
      | "eventKind.livestream"
      | "eventKind.zoom"
      | "event.inPerson";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  live_class: { labelKey: "eventKind.liveSession", icon: Video },
  live_stream: { labelKey: "eventKind.livestream", icon: Radio },
  zoom_class: { labelKey: "eventKind.zoom", icon: Video },
  onsite_event: { labelKey: "event.inPerson", icon: MapPin },
};

export function EventsList({
  events,
  isCoach,
}: {
  events: CalendarEvent[];
  isCoach: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("site");
  const config = useTenant();
  const tz = config?.timezone || "UTC";

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">{t("events.noneScheduled")}</p>
        {isCoach && (
          <Link
            href="/admin/live"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("events.scheduleFirst")}
          </Link>
        )}
      </div>
    );
  }

  // Group by calendar date (UTC date key of scheduled_at — matches the
  // shape formatDateHeader expects).
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = event.scheduled_at.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([dateKey, dayEvents]) => (
        <section key={dateKey}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDateHeader(dateKey, locale)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dayEvents.map((event) => {
              const meta = TYPE_META[event.type];
              return (
                <Link
                  key={`${event.type}-${event.id}`}
                  href={`/calendar/${event.type}/${event.id}`}
                  className="group overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                >
                  {event.cover_design ? (
                    <div className="relative h-36 w-full">
                      <CoverArt
                        design={event.cover_design}
                        item={eventItem(event, tz)}
                      />
                    </div>
                  ) : event.thumbnail_signed_url ? (
                    <img
                      src={event.thumbnail_signed_url}
                      alt=""
                      className="h-36 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-36 w-full items-center justify-center bg-muted">
                      <meta.icon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-2 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                        <meta.icon className="h-3 w-3" />
                        {t(meta.labelKey)}
                      </span>
                      <span>{formatTime(event.scheduled_at, locale, tz)}</span>
                      <span className="ml-auto font-medium text-foreground">
                        {eventPriceLabel(event, locale, t)}
                      </span>
                    </div>
                    <h3 className="font-medium leading-snug group-hover:text-primary">
                      {event.title}
                    </h3>
                    {event.type === "onsite_event" && event.location && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
