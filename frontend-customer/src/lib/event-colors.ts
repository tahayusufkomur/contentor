import type { CalendarEventType } from "@/types/live";

export const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  {
    labelKey: `eventType.${"liveSession" | "liveStream" | "onsiteEvent"}`;
    dotClass: string;
    borderClass: string;
    textClass: string;
    bgClass: string;
  }
> = {
  live_class: {
    labelKey: "eventType.liveSession",
    dotClass: "bg-primary",
    borderClass: "border-l-primary",
    textClass: "text-foreground",
    bgClass: "bg-primary/10",
  },
  live_stream: {
    labelKey: "eventType.liveStream",
    dotClass: "bg-violet-500",
    borderClass: "border-l-violet-500",
    textClass: "text-foreground",
    bgClass: "bg-violet-500/10",
  },
  onsite_event: {
    labelKey: "eventType.onsiteEvent",
    dotClass: "bg-emerald-500",
    borderClass: "border-l-emerald-500",
    textClass: "text-foreground",
    bgClass: "bg-emerald-500/10",
  },
  zoom_class: {
    labelKey: "eventType.liveSession",
    dotClass: "bg-primary",
    borderClass: "border-l-primary",
    textClass: "text-foreground",
    bgClass: "bg-primary/10",
  },
};
