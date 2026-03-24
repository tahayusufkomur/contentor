export const dynamic = "force-dynamic";

import { serverFetch } from "@/lib/api-server";
import { getAuthUser } from "@/lib/auth";
import { EventDetailClient } from "@/components/public/calendar/event-detail-client";
import { CalendarOff } from "lucide-react";
import type { CalendarEventDetail } from "@/types/live";

interface Props {
  params: Promise<{ type: string; id: string }>;
}

export default async function EventDetailPage({ params }: Props) {
  const { type, id } = await params;

  const [event, user] = await Promise.all([
    serverFetch<CalendarEventDetail>(`/api/v1/calendar/${type}/${id}/`).catch(
      () => null
    ),
    getAuthUser(),
  ]);

  if (!event) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <CalendarOff className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">
          The event you are looking for does not exist or has been removed.
        </p>
      </div>
    );
  }

  return <EventDetailClient event={event} isLoggedIn={!!user} />;
}
