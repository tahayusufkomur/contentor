import type { AnnouncementListItem } from "@/lib/announcements";
import type { EmailCampaign } from "@/lib/email-api";

/** One vocabulary for the state of anything the coach sent her students,
 *  whichever backend sent it. */
export type MessageStatus =
  "draft" | "scheduled" | "sending" | "sent" | "partial" | "failed";

export interface MessageRow {
  /** Unique across both kinds (an announcement and an email can share an id). */
  key: string;
  kind: "announcement" | "email";
  id: number;
  title: string;
  status: MessageStatus;
  /** Where it goes: the app, the app and email, or a designed email. */
  channel: "app" | "appEmail" | "email";
  /** The moment the row is about: when it goes out, went out, or was drafted. */
  at: string;
  recipients: number;
  /** Students who opened it (announcement) or received it (email). */
  reached: number;
  failed: number;
  href: string;
}

type Announcement = AnnouncementListItem & {
  also_email?: boolean;
  sent_at?: string | null;
};
type Campaign = Pick<
  EmailCampaign,
  | "id"
  | "subject"
  | "status"
  | "recipient_count"
  | "success_count"
  | "failure_count"
  | "created_at"
> & { scheduled_at?: string | null; sent_at?: string | null };

function fromAnnouncement(a: Announcement, now: number): MessageRow {
  // The API has no "sending": a send-now waits as `scheduled` with no time,
  // and a due one keeps its (past) time until the worker picks it up.
  const due = !a.scheduled_at || Date.parse(a.scheduled_at) <= now;
  const status: MessageStatus =
    a.status === "scheduled" ? (due ? "sending" : "scheduled") : a.status;
  return {
    key: `a-${a.id}`,
    kind: "announcement",
    id: a.id,
    title: a.title,
    status,
    channel: a.also_email ? "appEmail" : "app",
    at:
      status === "scheduled"
        ? a.scheduled_at!
        : status === "sent"
          ? (a.sent_at ?? a.scheduled_at ?? a.created_at)
          : a.created_at,
    recipients: a.recipient_count,
    reached: a.read_count,
    failed: 0,
    href:
      a.status === "draft"
        ? `/admin/messages/new?draft=${a.id}`
        : `/admin/messages/${a.id}`,
  };
}

function fromCampaign(c: Campaign): MessageRow {
  return {
    key: `e-${c.id}`,
    kind: "email",
    id: c.id,
    title: c.subject,
    status: c.status,
    channel: "email",
    at:
      c.status === "scheduled" && c.scheduled_at
        ? c.scheduled_at
        : (c.sent_at ?? c.created_at),
    recipients: c.recipient_count,
    reached: c.success_count,
    failed: c.failure_count,
    href: `/admin/messages/email/${c.id}`,
  };
}

/** Announcements and designed emails as one list: what goes out next on top,
 *  then the most recent. */
export function mergeMessages(
  announcements: Announcement[],
  campaigns: Campaign[],
  now: number = Date.now(),
): MessageRow[] {
  return [
    ...announcements.map((a) => fromAnnouncement(a, now)),
    ...campaigns.map(fromCampaign),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}
