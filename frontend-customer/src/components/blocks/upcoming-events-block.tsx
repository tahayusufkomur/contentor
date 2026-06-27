import { CalendarDays } from "lucide-react";
import { EventsCatalogClient } from "@/components/public/events-catalog-client";
import { BlockPlaceholder } from "./block-placeholder";
import type { CalendarEvent } from "@/types/live";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function UpcomingEventsBlock({
  data,
  dynamicData,
  editable,
}: BlockComponentProps) {
  let events: CalendarEvent[] = dynamicData ?? [];
  const limit = Number(data.limit) || 6;
  events = events.slice(0, limit);
  if (!events.length)
    return editable ? (
      <BlockPlaceholder
        icon={CalendarDays}
        title="Your events will appear here"
        description="Schedule an event and it'll show up automatically."
      />
    ) : null;
  const layout = data.layout || "grid";
  const filterGroupIds = Array.isArray(data.filterGroups) ? (data.filterGroups as number[]) : [];

  const wide = layout === "list" ? "max-w-3xl" : "max-w-7xl";

  return (
    <section className="py-16">
      <div className={`mx-auto px-4 ${wide}`}>
        {data.heading && (
          <h2 className="mb-8 font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}
        <EventsCatalogClient events={events} layout={layout} filterGroupIds={filterGroupIds} />
      </div>
    </section>
  );
}
