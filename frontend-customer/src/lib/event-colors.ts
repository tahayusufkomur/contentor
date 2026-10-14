import type { CalendarEventType } from "@/types/live";

export const EVENT_TYPE_CONFIG: Record<
  CalendarEventType,
  {
    label: string;
    dotClass: string;
    borderClass: string;
    textClass: string;
    bgClass: string;
  }
> = {
  live_class: {
    label: "Live Class",
    dotClass: "bg-primary",
    borderClass: "border-l-primary",
    textClass: "text-foreground",
    bgClass: "bg-primary/10",
  },
  live_stream: {
    label: "Live Stream",
    dotClass: "bg-violet-500",
    borderClass: "border-l-violet-500",
    textClass: "text-foreground",
    bgClass: "bg-violet-500/10",
  },
  onsite_event: {
    label: "On-site Event",
    dotClass: "bg-emerald-500",
    borderClass: "border-l-emerald-500",
    textClass: "text-foreground",
    bgClass: "bg-emerald-500/10",
  },
  zoom_class: {
    label: "Live Class",
    dotClass: "bg-primary",
    borderClass: "border-l-primary",
    textClass: "text-foreground",
    bgClass: "bg-primary/10",
  },
};
