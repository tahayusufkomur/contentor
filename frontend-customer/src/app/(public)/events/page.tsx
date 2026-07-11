export const dynamic = "force-dynamic";

import Link from "next/link";
import { serverFetch } from "@/lib/api-server";
import { getAuthUser } from "@/lib/auth";
import { EventsList } from "@/components/public/events/events-list";
import type { CalendarEvent } from "@/types/live";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export default async function EventsPage() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);

  let events: CalendarEvent[] = [];
  try {
    events = await serverFetch<CalendarEvent[]>(
      `/api/v1/calendar/?from=${isoDate(from)}&to=${isoDate(to)}`,
    );
  } catch {
    events = [];
  }
  events.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const user = await getAuthUser();
  const isCoach = user?.role === "owner" || user?.role === "coach";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Upcoming events
          </h1>
          <p className="mt-1 text-muted-foreground">
            Live classes, streams, and in-person events over the next 90 days.
          </p>
        </div>
        <Link
          href="/calendar"
          className="text-sm font-medium text-primary hover:underline"
        >
          View as calendar →
        </Link>
      </div>
      <EventsList events={events} isCoach={isCoach} />
    </div>
  );
}
