// Superadmin platform inbox API client, base `/api/v1/platform/mailbox`.
// Mirrors the coach mailbox client but drops settings; auth rides the
// same-origin admin cookie (shared api-client). Attachment upload uses
// clientFetch directly — FormData must set its own multipart boundary.

import { clientFetch, jsonFetch } from "./api-client";

const BASE = "/api/v1/platform/mailbox";

export interface MessageAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  omitted: boolean;
  download_url: string;
}

export interface ConversationListItem {
  id: number;
  subject: string;
  counterparty_email: string;
  counterparty_name: string;
  student_email: string;
  student_name: string;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  is_spam: boolean;
  last_message_preview: string;
  last_message_has_attachments: boolean;
}

export interface MailboxMessage {
  id: number;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string;
  text: string;
  html: string;
  is_read: boolean;
  created_at: string;
  attachments: MessageAttachment[];
}

export interface ConversationDetail extends ConversationListItem {
  messages: MailboxMessage[];
}

export interface OutgoingMessage {
  text: string;
  html?: string;
  attachment_ids?: number[];
}

export function listConversations() {
  return jsonFetch<ConversationListItem[]>(`${BASE}/conversations/`);
}

export function getConversation(id: number) {
  return jsonFetch<ConversationDetail>(`${BASE}/conversations/${id}/`);
}

export function compose(
  body: OutgoingMessage & { to: string; subject: string },
) {
  return jsonFetch<{ conversation_id: number; message_id: number }>(
    `${BASE}/compose/`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function reply(id: number, body: OutgoingMessage) {
  return jsonFetch<{ message_id: number }>(
    `${BASE}/conversations/${id}/reply/`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function uploadAttachment(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  // No Content-Type header — the browser sets the multipart boundary.
  return clientFetch<MessageAttachment>(`${BASE}/attachments/`, {
    method: "POST",
    body: fd,
  });
}

export function updateConversation(
  id: number,
  patch: { is_archived?: boolean; is_spam?: boolean },
) {
  return jsonFetch<ConversationListItem>(`${BASE}/conversations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteConversation(id: number) {
  return jsonFetch<void>(`${BASE}/conversations/${id}/`, { method: "DELETE" });
}
