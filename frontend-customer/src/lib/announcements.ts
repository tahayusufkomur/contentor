import { clientFetch } from "@/lib/api-client";

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
}

export const draftToComposePrefill = (
  draft: AnnouncementDetail,
): ComposePrefill => ({
  title: draft.title,
  body: draft.body,
  link: draft.link || "",
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

/** She changed this field since `was`, the copy it was last given from the
 *  server or the copy run (the form holds it as typed, the server trims). */
export const isHers = (field: keyof DraftFields, mine: string, was: string) =>
  tidyField(field, mine) !== was;

/** The run is typing this field in and it is not hers: read-only until it is
 *  done. A field she changed first is never taken over (her keys land, the
 *  run's typing is not shown over it). */
export const isWriting = (
  field: keyof DraftFields,
  typing: boolean,
  mine: string,
  was: string,
) => typing && !isHers(field, mine, was);

/** A newer copy of the draft (`next`) laid over the form: each field takes the
 *  copy's value unless she changed it since `was`, or the copy has nothing new
 *  for it (what she is typing is left as typed). Returns the form after, and
 *  the copy the form now stands on (`was` for the fields it did not take). */
export function layOver(
  mine: DraftFields,
  was: DraftFields,
  next: DraftFields,
) {
  const form = { ...mine };
  const placed = { ...was };
  for (const field of Object.keys(TIDY) as (keyof DraftFields)[])
    if (next[field] !== was[field] && !isHers(field, mine[field], was[field])) {
      form[field] = next[field];
      placed[field] = next[field];
    }
  return { form, placed };
}

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
