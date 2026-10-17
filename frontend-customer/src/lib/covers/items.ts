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
