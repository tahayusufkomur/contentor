"use client";

import { cn } from "@/lib/utils";
import { EVENT_TYPE_CONFIG } from "@/lib/event-colors";
import type { CalendarEventType } from "@/types/live";

const ALL_TYPES: CalendarEventType[] = ["live_class", "live_stream", "onsite_event"];

interface EventTypeFilterProps {
  activeTypes: Set<CalendarEventType>;
  onToggle: (type: CalendarEventType) => void;
}

export function EventTypeFilter({ activeTypes, onToggle }: EventTypeFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TYPES.map((type) => {
        const config = EVENT_TYPE_CONFIG[type];
        const active = activeTypes.has(type);
        return (
          <button
            key={type}
            onClick={() => onToggle(type)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors border",
              active
                ? "bg-card border-border text-foreground"
                : "bg-transparent border-transparent text-muted-foreground opacity-50"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
