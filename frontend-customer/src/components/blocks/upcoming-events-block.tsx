import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin } from "lucide-react";
import type { CalendarEvent } from "@/types/live";
import type { BlockComponentProps } from "@/lib/blocks/types";

const TYPE_LABELS: Record<string, string> = {
  live_class: "Live Class",
  live_stream: "Live Stream",
  onsite_event: "Event",
};

export function UpcomingEventsBlock({ data, dynamicData }: BlockComponentProps) {
  let events: CalendarEvent[] = dynamicData ?? [];
  const limit = Number(data.limit) || 6;
  events = events.slice(0, limit);
  if (!events.length) return null;

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <h2 className="mb-8 font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const when = new Date(event.scheduled_at);
            return (
              <Link key={`${event.type}-${event.id}`} href={`/calendar/${event.type}/${event.id}`}>
                <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <CardContent className="space-y-3 p-5">
                    <Badge variant="secondary" className="text-xs">
                      {TYPE_LABELS[event.type] ?? event.type}
                    </Badge>
                    <h3 className="font-semibold leading-snug line-clamp-2">{event.title}</h3>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {when.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
