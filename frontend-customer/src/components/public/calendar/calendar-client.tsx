"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import { useTenant } from "@/hooks/use-tenant";
import {
  formatMonthYear,
  getDateRangeParams,
} from "@/lib/calendar-utils";
import { ViewToggle } from "./view-toggle";
import { EventTypeFilter } from "./event-type-filter";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarAgendaView } from "./calendar-agenda-view";
import type { CalendarEvent, CalendarEventType } from "@/types/live";

type View = "month" | "agenda";

interface CalendarClientProps {
  initialEvents: CalendarEvent[];
  initialView: string;
  initialDate: string;
}

export function CalendarClient({
  initialEvents,
  initialView,
  initialDate,
}: CalendarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantConfig = useTenant();
  const tz = tenantConfig?.timezone || "UTC";

  const [view, setView] = useState<View>(() => {
    const v = (initialView || searchParams.get("view") || "month") as View;
    return ["month", "agenda"].includes(v) ? v : "month";
  });
  const [currentDate, setCurrentDate] = useState(
    () => new Date(initialDate || new Date().toISOString().split("T")[0])
  );
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [activeTypes, setActiveTypes] = useState<Set<CalendarEventType>>(
    () => new Set<CalendarEventType>(["live_class", "live_stream", "onsite_event"])
  );
  const [loading, setLoading] = useState(false);

  // Detect mobile on mount and default to agenda
  useEffect(() => {
    if (window.innerWidth < 768 && !searchParams.get("view")) {
      setView("agenda");
    }
  }, [searchParams]);

  const fetchEvents = useCallback(async (v: View, date: Date) => {
    setLoading(true);
    try {
      const { from, to } = getDateRangeParams(v, date);
      const data = await clientFetch<CalendarEvent[]>(
        `/api/v1/calendar/?from=${from}&to=${to}`
      );
      setEvents(data);
    } catch {
      // keep existing events on error
    } finally {
      setLoading(false);
    }
  }, []);

  const updateURL = useCallback(
    (v: View, date: Date) => {
      const dateStr = date.toISOString().split("T")[0];
      router.replace(`/calendar?view=${v}&date=${dateStr}`, { scroll: false });
    },
    [router]
  );

  const handleViewChange = (v: View) => {
    setView(v);
    updateURL(v, currentDate);
    fetchEvents(v, currentDate);
  };

  const navigate = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (view === "month") {
      next.setMonth(next.getMonth() + direction);
    } else {
      next.setDate(next.getDate() + direction * 30);
    }
    setCurrentDate(next);
    updateURL(view, next);
    fetchEvents(view, next);
  };

  const handleToggleType = (type: CalendarEventType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const goToday = () => {
    const today = new Date();
    setCurrentDate(today);
    updateURL(view, today);
    fetchEvents(view, today);
  };

  // zoom_class events are grouped under the live_class chip (student-facing they're both "Live Class")
  const filteredEvents = events.filter(
    (e) => activeTypes.has(e.type) || (e.type === "zoom_class" && activeTypes.has("live_class"))
  );

  const title =
    view === "month"
      ? formatMonthYear(currentDate)
      : "Upcoming Events";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold tracking-tight min-w-[200px]">
            {title}
          </h2>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="text-xs">
            Today
          </Button>
        </div>
        <ViewToggle view={view} onChange={handleViewChange} />
      </div>

      {/* Filters */}
      <EventTypeFilter activeTypes={activeTypes} onToggle={handleToggleType} />

      {/* Calendar view */}
      <div className={loading ? "opacity-60 transition-opacity" : ""}>
        {view === "month" && (
          <CalendarMonthView events={filteredEvents} currentDate={currentDate} timezone={tz} />
        )}
        {view === "agenda" && <CalendarAgendaView events={filteredEvents} timezone={tz} />}
      </div>
    </div>
  );
}
