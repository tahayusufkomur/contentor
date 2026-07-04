import { clientFetch } from "@/lib/api-client";

const BASE = "/api/v1/mailbox";

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

export function compose(body: { to: string; subject: string; text: string }) {
  return clientFetch<{ conversation_id: number; message_id: number }>(`${BASE}/compose/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reply(id: number, text: string) {
  return clientFetch<{ message_id: number }>(`${BASE}/conversations/${id}/reply/`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function updateConversation(id: number, patch: { is_archived?: boolean; is_spam?: boolean }) {
  return clientFetch<ConversationListItem>(`${BASE}/conversations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteConversation(id: number) {
  return clientFetch<void>(`${BASE}/conversations/${id}/`, { method: "DELETE" });
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
