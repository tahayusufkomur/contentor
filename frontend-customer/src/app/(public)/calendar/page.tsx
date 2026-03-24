export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { serverFetch } from "@/lib/api-server";
import { getDateRangeParams } from "@/lib/calendar-utils";
import { CalendarClient } from "@/components/public/calendar/calendar-client";
import type { CalendarEvent } from "@/types/live";

interface Props {
  searchParams: Promise<{ view?: string; date?: string }>;
}

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const view = params.view || "month";
  const dateStr = params.date || new Date().toISOString().split("T")[0];
  const date = new Date(dateStr);
  const { from, to } = getDateRangeParams(view, date);

  let events: CalendarEvent[] = [];
  try {
    events = await serverFetch<CalendarEvent[]>(
      `/api/v1/calendar/?from=${from}&to=${to}`
    );
  } catch {
    events = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Calendar
        </h1>
        <p className="mt-1 text-muted-foreground">
          Browse upcoming live classes, streams, and events.
        </p>
      </div>

      {/* Break out of max-w-7xl container to use more screen width */}
      <div className="xl:-mx-16 2xl:-mx-24">
        <Suspense>
          <CalendarClient
            initialEvents={events}
            initialView={view}
            initialDate={dateStr}
          />
        </Suspense>
      </div>
    </div>
  );
}
