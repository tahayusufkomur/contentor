// The course or event a cover is drawn for, read off its payload: the words and dates a design binds to.

import type { Course } from "@/types/course";
import type { CoverItem } from "@/types/design";
import type { CalendarEvent } from "@/types/live";

/** A course: its own title, and when it was made (the "New" badge). */
export const courseItem = (c: Course): CoverItem => ({
  title: c.title,
  createdAt: c.created_at,
});

/** An event: its own title and start (the date badge), read in `timeZone`, the tenant's, when given. */
export const eventItem = (
  e: CalendarEvent,
  timeZone?: string | null,
): CoverItem => ({
  title: e.title,
  startsAt: e.scheduled_at,
  timeZone,
});

/** An item of the store or of a plan (a course or an event): the same words and dates as `courseItem` and
 *  `eventItem` read, so its cover looks the same here as on its own page. The payload carries a course's
 *  `created_at` or an event's `scheduled_at`, and the date badge reads the latter in `timeZone`. */
export const listedItem = (
  i: {
    title: string;
    created_at?: string | null;
    scheduled_at?: string | null;
  },
  timeZone?: string | null,
): CoverItem => ({
  title: i.title,
  createdAt: i.created_at,
  startsAt: i.scheduled_at,
  timeZone,
});
