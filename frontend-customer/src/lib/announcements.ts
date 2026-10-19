import { clientFetch } from "@/lib/api-client";
import { ownership } from "@/lib/focus/own-fields";

export interface AnnouncementFilters {
  app_type?: "pwa" | "browser";
  platform?: ("ios" | "android" | "desktop")[];
  push_enabled?: boolean;
  content_type?: "course" | "bundle";
  content_id?: number;
}

export interface AnnouncementListItem {
  id: number;
  title: string;
  status: "draft" | "scheduled" | "sent";
  scheduled_at: string | null;
  created_at: string;
  also_email?: boolean;
  recipient_count: number;
  push_sent_count: number;
  read_count: number;
}

export interface Recipient {
  user_id: number;
  name: string;
  push_status: "none" | "sent" | "failed" | "expired";
  read_at: string | null;
}

export interface AnnouncementDetail extends AnnouncementListItem {
  body: string;
  link: string;
  filters: AnnouncementFilters;
  recipients: Recipient[];
}

export interface FeedItem {
  id: number;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read_at: string | null;
}

const ADMIN_BASE = "/api/v1/admin/notifications";
const BASE = `${ADMIN_BASE}/announcements`;

export interface AnnouncementTemplate {
  id: number | string;
  name: string;
  title: string;
  body: string;
  link: string;
  link_label: string;
  builtin: boolean;
}

export type Frequency = "daily" | "weekly" | "monthly";

export interface RecurringAnnouncement {
  id: number;
  title: string;
  body: string;
  link: string;
  link_label: string;
  filters: AnnouncementFilters;
  also_email: boolean;
  frequency: Frequency;
  send_time: string; // "HH:MM"
  weekday: number | null;
  day_of_month: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  next_run_at: string;
  is_active: boolean;
}

/** Fields AnnouncementCompose needs to prefill from a draft it's reviewing.
 * "Draft as template": the compose form is seeded from the draft's content,
 * but the draft row itself is never edited or status-transitioned — see
 * draftReviewSubmitted() below. */
export interface ComposePrefill {
  title: string;
  body: string;
  link: string;
  /** Who, when and by email as the draft holds them (a focus-mode Keep writes them). */
  filters: AnnouncementFilters;
  /** A `datetime-local` value on her browser's clock, or "" (send now; a time already passed too). */
  scheduledAt: string;
  alsoEmail: boolean;
}

/** An ISO time as a `datetime-local` value on this browser's clock. */
const localInput = (iso: string) => {
  const at = new Date(iso);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export const draftToComposePrefill = (
  draft: AnnouncementDetail,
): ComposePrefill => ({
  title: draft.title,
  body: draft.body,
  link: draft.link || "",
  filters: draft.filters,
  // A kept time that has passed is not offered: she picks a new one (as keep() on the server).
  scheduledAt:
    draft.scheduled_at && Date.parse(draft.scheduled_at) > Date.now()
      ? localInput(draft.scheduled_at)
      : "",
  alsoEmail: draft.also_email ?? false,
});

/** The fields of a draft that she and the copy run both write (focus mode). */
export interface DraftFields {
  title: string;
  body: string;
  link: string;
}

// A field as the server keeps it: it trims a title and a link.
const TIDY: Record<keyof DraftFields, (value: string) => string> = {
  title: (value) => value.trim(),
  body: (value) => value,
  link: (value) => value.trim(),
};

/** One field as the server holds it. */
export const tidyField = (field: keyof DraftFields, value: string) =>
  TIDY[field](value);

/** The draft's fields as the server holds them, from any record that has them. */
export const draftFields = (draft: Partial<DraftFields>): DraftFields => ({
  title: TIDY.title(draft.title ?? ""),
  body: draft.body ?? "",
  link: TIDY.link(draft.link ?? ""),
});

/** Which fields of the form are hers, which the run is writing, and a newer
 *  copy laid over the rest: the rules focus mode shares (`lib/focus/own-fields`). */
export const { isHers, isWriting, layOver } = ownership(TIDY);

/** The fields she changed since `base` (the server's copy), as a PATCH body.
 *  Only those: a field she left alone may have been written by the copy run
 *  since, and must not be reverted. A cleared title is not saved: the server
 *  needs one, and she is most likely about to type another. */
export function draftChanges(
  mine: DraftFields,
  base: DraftFields,
): Partial<DraftFields> {
  const changes: Partial<DraftFields> = {};
  for (const field of Object.keys(TIDY) as (keyof DraftFields)[]) {
    const value = TIDY[field](mine[field]);
    if (value !== base[field] && (field !== "title" || value))
      changes[field] = value;
  }
  return changes;
}

/** Save what she changed on a draft in place. Resolves to the fields sent
 *  (none: no request); a failure is thrown, her text stays where it is.
 *  `init` passes through to the request (`keepalive`: it outlives the page). */
export async function saveDraftChanges(
  id: number,
  mine: DraftFields,
  base: DraftFields,
  init?: RequestInit,
): Promise<Partial<DraftFields>> {
  const changes = draftChanges(mine, base);
  if (Object.keys(changes).length) await patchAnnouncement(id, changes, init);
  return changes;
}

export const previewAudience = (filters: AnnouncementFilters) =>
  clientFetch<{ audience: number; push_reachable: number }>(
    `${BASE}/preview/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
    },
  );

export const createAnnouncement = (payload: {
  title: string;
  body: string;
  link?: string;
  filters: AnnouncementFilters;
  scheduled_at?: string | null;
  also_email?: boolean;
}) =>
  clientFetch<AnnouncementDetail>(`${BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const listAnnouncements = () =>
  clientFetch<AnnouncementListItem[]>(`${BASE}/`);
export const getAnnouncement = (id: number) =>
  clientFetch<AnnouncementDetail>(`${BASE}/${id}/`);
export const patchAnnouncement = (
  id: number,
  payload: Partial<{
    title: string;
    body: string;
    link: string;
    filters: AnnouncementFilters;
    scheduled_at: string | null;
  }>,
  init?: RequestInit,
) =>
  clientFetch<AnnouncementDetail>(`${BASE}/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    ...init,
  });
export const deleteAnnouncement = (id: number) =>
  clientFetch<void>(`${BASE}/${id}/`, { method: "DELETE" });

export const getFeed = () =>
  clientFetch<{ items: FeedItem[]; unread_count: number }>(
    "/api/v1/notifications/feed/",
  );
export const markRead = (id: number) =>
  clientFetch<{ unread_count: number }>(
    `/api/v1/notifications/feed/${id}/read/`,
    {
      method: "POST",
    },
  );

// Templates
export const listTemplates = () =>
  clientFetch<AnnouncementTemplate[]>(`${ADMIN_BASE}/templates/`);
export const saveTemplate = (payload: {
  name: string;
  title: string;
  body: string;
  link?: string;
  link_label?: string;
}) =>
  clientFetch<AnnouncementTemplate>(`${ADMIN_BASE}/templates/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const deleteTemplate = (id: number) =>
  clientFetch<void>(`${ADMIN_BASE}/templates/${id}/`, { method: "DELETE" });

// Recurring
export const listRecurring = () =>
  clientFetch<RecurringAnnouncement[]>(`${ADMIN_BASE}/recurring/`);
export const createRecurring = (
  payload: Partial<RecurringAnnouncement> & { filters: AnnouncementFilters },
) =>
  clientFetch<RecurringAnnouncement>(`${ADMIN_BASE}/recurring/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const patchRecurring = (
  id: number,
  payload: Partial<RecurringAnnouncement>,
) =>
  clientFetch<RecurringAnnouncement>(`${ADMIN_BASE}/recurring/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const deleteRecurring = (id: number) =>
  clientFetch<void>(`${ADMIN_BASE}/recurring/${id}/`, { method: "DELETE" });
