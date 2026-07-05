import { clientFetch } from "@/lib/api-client";

const BASE = "/api/v1/mailbox";

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
  student: number | null;
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

export interface MailboxSettings {
  has_custom_domain: boolean;
  domain: string;
  local_part: string;
  enabled: boolean;
  can_receive: boolean;
  from_email: string;
  // Platform mailbox tier (paid coaches pick `<x>@platform_domain`).
  platform_domain: string;
  platform_local_part: string;
  platform_eligible: boolean;
}

export function listConversations() {
  return clientFetch<ConversationListItem[]>(`${BASE}/conversations/`);
}

export function getConversation(id: number) {
  return clientFetch<ConversationDetail>(`${BASE}/conversations/${id}/`);
}

export interface OutgoingMessage {
  text: string;
  html?: string;
  attachment_ids?: number[];
}

export function compose(
  body: OutgoingMessage & { to: string; subject: string },
) {
  return clientFetch<{ conversation_id: number; message_id: number }>(
    `${BASE}/compose/`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function reply(id: number, body: OutgoingMessage) {
  return clientFetch<{ message_id: number }>(
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
  return clientFetch<MessageAttachment>(`${BASE}/attachments/`, {
    method: "POST",
    body: fd,
  });
}

export function updateConversation(
  id: number,
  patch: { is_archived?: boolean; is_spam?: boolean },
) {
  return clientFetch<ConversationListItem>(`${BASE}/conversations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteConversation(id: number) {
  return clientFetch<void>(`${BASE}/conversations/${id}/`, {
    method: "DELETE",
  });
}

export function getSettings() {
  return clientFetch<MailboxSettings>(`${BASE}/settings/`);
}

export function saveSettings(body: { local_part: string; enabled: boolean }) {
  return clientFetch<MailboxSettings>(`${BASE}/settings/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function savePlatformAddress(localPart: string) {
  return clientFetch<MailboxSettings>(`${BASE}/settings/`, {
    method: "PUT",
    body: JSON.stringify({ platform_local_part: localPart }),
  });
}
