// Platform email API client (superadmin → coaches), base `/api/v1/platform/email`.
// Mirrors frontend-customer's coach email-api, but recipients are coaches and
// auth rides the same-origin admin cookie (shared api-client).

import { jsonFetch } from "./api-client";

export interface EmailSession {
  session_token: string;
  expires_at: string;
}

export interface EmailSetupResponse {
  ready: boolean;
  provisioned: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  json_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GalleryTemplate {
  id: string;
  name: string;
  category: string;
  is_premium: boolean;
  [key: string]: unknown;
}

export type RecipientFilter =
  | { type: "all_coaches" }
  | { type: "plan"; plan_ids: number[] }
  | { type: "tenant"; tenant_ids: number[] }
  | { type: "individual"; user_ids: number[] };

export interface RecipientOptions {
  coaches: { id: number; name: string; email: string }[];
  plans: { id: number; name: string }[];
  tenants: { id: number; name: string; owner_email: string }[];
}

export interface CampaignRecipientEntry {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  status: "sent" | "failed";
  error_message: string;
  sent_at: string | null;
}

export interface EmailCampaign {
  id: number;
  subject: string;
  template_id: string;
  template_name: string;
  sender: number | null;
  sender_name: string;
  sender_email: string;
  recipient_filter: RecipientFilter;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  status: "sending" | "sent" | "partial" | "failed";
  rendered_html: string;
  recipient_summary: string;
  created_at: string;
  sent_at: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  results: T[];
}

const BASE = "/api/v1/platform/email";

export async function createEmailSession(): Promise<EmailSession> {
  return jsonFetch<EmailSession>(`${BASE}/session/`, { method: "POST" });
}

export async function setupEmail(): Promise<EmailSetupResponse> {
  return jsonFetch<EmailSetupResponse>(`${BASE}/setup/`, { method: "POST" });
}

export async function listTemplates(): Promise<
  EmailTemplate[] | { results: EmailTemplate[] }
> {
  return jsonFetch<EmailTemplate[] | { results: EmailTemplate[] }>(
    `${BASE}/templates/`,
  );
}

export async function getTemplate(id: string): Promise<EmailTemplate> {
  return jsonFetch<EmailTemplate>(`${BASE}/templates/${id}/`);
}

export async function deleteTemplate(id: string): Promise<void> {
  return jsonFetch<void>(`${BASE}/templates/${id}/`, { method: "DELETE" });
}

export async function listGallery(
  category?: string,
): Promise<GalleryTemplate[] | { results: GalleryTemplate[] }> {
  const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
  return jsonFetch<GalleryTemplate[] | { results: GalleryTemplate[] }>(
    `${BASE}/gallery/${suffix}`,
  );
}

export async function getRecipientOptions(): Promise<RecipientOptions> {
  return jsonFetch<RecipientOptions>(`${BASE}/recipient-options/`);
}

export async function sendCampaign(data: {
  template_id: string;
  template_name?: string;
  subject: string;
  recipient_filter: RecipientFilter;
}): Promise<EmailCampaign> {
  return jsonFetch<EmailCampaign>(`${BASE}/send/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listCampaigns(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<EmailCampaign>> {
  return jsonFetch<PaginatedResponse<EmailCampaign>>(
    `${BASE}/campaigns/?limit=${limit}&offset=${offset}`,
  );
}

export async function getCampaign(id: number): Promise<EmailCampaign> {
  return jsonFetch<EmailCampaign>(`${BASE}/campaigns/${id}/`);
}

export async function copyTemplate(
  sourceTemplateId: string,
): Promise<{ id: string; name: string }> {
  return jsonFetch<{ id: string; name: string }>(`${BASE}/templates/copy/`, {
    method: "POST",
    body: JSON.stringify({ source_template_id: sourceTemplateId }),
  });
}

export async function previewTemplates(templateIds: string[]): Promise<{
  previews: Record<string, string>;
  errors: Record<string, string>;
}> {
  return jsonFetch<{
    previews: Record<string, string>;
    errors: Record<string, string>;
  }>(`${BASE}/templates/preview/`, {
    method: "POST",
    body: JSON.stringify({ template_ids: templateIds }),
  });
}

export async function listCampaignRecipients(
  campaignId: number,
): Promise<{ results: CampaignRecipientEntry[] }> {
  return jsonFetch<{ results: CampaignRecipientEntry[] }>(
    `${BASE}/campaigns/${campaignId}/recipients/`,
  );
}
