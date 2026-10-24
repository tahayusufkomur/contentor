import { MapPin, Radio, Video, type LucideIcon } from "lucide-react";
import type { FilterOption, Tag } from "@/types/course";
import type { CoverDesign } from "@/types/design";

/** Where a class or event happens. The four kinds are four tables on the
 *  server; here they are one list and one form, and this table holds every
 *  difference between them. The names are the assistant's (`kind=` in its
 *  links). */
export type EventKind = "live" | "stream" | "zoom" | "onsite";

/** A row of GET /api/v1/admin/events/: the kind's own fields plus `kind`. */
export interface EventRow {
  id: number;
  kind: EventKind;
  title: string;
  description: string;
  /** Stored: only moves when she presses Go live or End. */
  status: string;
  /** Follows the clock. */
  computed_status?: string;
  pricing_type: string;
  price: string;
  scheduled_at: string | null;
  created_at: string;
  /** The kept cover its series wears; null or absent when it has none. */
  cover_design?: CoverDesign | null;
  /** The plain photo it wears, signed; null or empty for none. */
  thumbnail_signed_url?: string | null;
  filter_options?: FilterOption[];
  tags?: Tag[];
  auto_recording?: boolean;
  /** Storage key of a prepared Excalidraw board, "" for none. */
  whiteboard_key?: string;
  /** Students and viewers see their own name over the video. */
  watermark?: boolean;
  zoom_link?: string;
  location?: string;
  address?: string;
  max_capacity?: number | null;
}

export type KindField =
  | "auto_recording"
  | "whiteboard_key"
  | "watermark"
  | "zoom_link"
  | "location"
  | "address"
  | "max_capacity";

interface KindConfig {
  /** Its CRUD endpoint (list/create; `<id>/` for one). */
  api: string;
  icon: LucideIcon;
  /** The fields only this kind has. */
  fields: KindField[];
  /** Runs in the built-in video room: the page a "Go live" opens. */
  room?: (id: number) => string;
  /** `?tab=` in links made before the four tabs became one list. */
  legacyTab: string;
  /** Its key in the demo-content index. */
  demo: string;
}

export const EVENT_KINDS: Record<EventKind, KindConfig> = {
  live: {
    api: "/api/v1/live/",
    icon: Video,
    fields: ["auto_recording", "watermark", "whiteboard_key"],
    room: (id) => `/live/${id}`,
    legacyTab: "classes",
    demo: "live_classes",
  },
  stream: {
    api: "/api/v1/live-streams/",
    icon: Radio,
    fields: ["auto_recording", "watermark", "whiteboard_key"],
    room: (id) => `/live-stream/${id}`,
    legacyTab: "streams",
    demo: "live_streams",
  },
  zoom: {
    api: "/api/v1/zoom-classes/",
    icon: Video,
    fields: ["zoom_link"],
    legacyTab: "zoom",
    demo: "zoom_classes",
  },
  onsite: {
    api: "/api/v1/onsite-events/",
    icon: MapPin,
    fields: ["location", "address", "max_capacity"],
    legacyTab: "onsite",
    demo: "onsite_events",
  },
};

export const KIND_ORDER: EventKind[] = ["live", "stream", "zoom", "onsite"];

/** The kind a link names: `?kind=` (the assistant's links, the calendar's) or
 *  the `?tab=` of an older link. */
export function kindFromParams(params: URLSearchParams): EventKind | null {
  const kind = params.get("kind");
  if (kind && kind in EVENT_KINDS) return kind as EventKind;
  const tab = params.get("tab");
  return KIND_ORDER.find((k) => EVENT_KINDS[k].legacyTab === tab) ?? null;
}

/** What the list shows as an event's state. A draft is a draft, a held one
 *  (kept with its date) too, until she publishes it. A built-in class or
 *  stream is live only while she runs it; anything else follows the clock,
 *  because nothing ever ends a Zoom class or an in-person event in the database. */
export function displayStatus(event: EventRow): string {
  if (event.status === "draft") return "draft";
  const clock = event.computed_status ?? event.status;
  if (EVENT_KINDS[event.kind].room) {
    if (event.status === "live" || event.status === "ended")
      return event.status;
    return clock === "ended" ? "ended" : event.status;
  }
  return clock === "ongoing" ? "live" : clock;
}
