"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin } from "lucide-react";
import {
  FacetPills,
  buildFacets,
  matchesFacets,
  type FacetSelection,
} from "@/components/public/facet-pills";
import type { CalendarEvent } from "@/types/live";

const TYPE_LABELS: Record<string, string> = {
  live_class: "Live Class",
  live_stream: "Live Stream",
  onsite_event: "Event",
  zoom_class: "Live Class",
};

const fmtWhen = (d: Date) =>
  d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

interface EventsCatalogClientProps {
  events: CalendarEvent[];
  layout: string;
  filterGroupIds: number[];
}

export function EventsCatalogClient({
  events,
  layout,
  filterGroupIds,
}: EventsCatalogClientProps) {
  const [facetSel, setFacetSel] = useState<FacetSelection>({});
  const facets = useMemo(
    () => buildFacets(events, filterGroupIds),
    [events, filterGroupIds],
  );
  const filtered = useMemo(
    () => events.filter((e) => matchesFacets(e, facetSel)),
    [events, facetSel],
  );

  const facetBar = facets.length > 0 && (
    <div className="mb-6">
      <FacetPills facets={facets} selected={facetSel} onChange={setFacetSel} />
    </div>
  );

  if (layout === "list") {
    return (
      <>
        {facetBar}
        <div className="space-y-3">
          {filtered.map((event) => {
            const when = new Date(event.scheduled_at);
            return (
              <Link
                key={`${event.type}-${event.id}`}
                href={`/calendar/${event.type}/${event.id}`}
                className="block"
              >
                <Card className="transition-all hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <Badge variant="secondary" className="text-xs">
                      {TYPE_LABELS[event.type] ?? event.type}
                    </Badge>
                    <span className="flex-1 font-semibold leading-snug">
                      {event.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmtWhen(when)}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      {facetBar}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((event) => {
          const when = new Date(event.scheduled_at);
          return (
            <Link
              key={`${event.type}-${event.id}`}
              href={`/calendar/${event.type}/${event.id}`}
            >
              <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <CardContent className="space-y-3 p-5">
                  <Badge variant="secondary" className="text-xs">
                    {TYPE_LABELS[event.type] ?? event.type}
                  </Badge>
                  <h3 className="font-semibold leading-snug line-clamp-2">
                    {event.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {fmtWhen(when)}
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
    </>
  );
}
