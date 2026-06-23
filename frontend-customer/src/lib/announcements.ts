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
  status: "scheduled" | "sent";
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
) =>
  clientFetch<AnnouncementDetail>(`${BASE}/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
