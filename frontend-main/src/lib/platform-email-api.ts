// Platform email API client (superadmin → coaches), base `/api/v1/platform/email`.
// Mirrors frontend-customer's coach email-api, but recipients are coaches and
// auth rides the same-origin admin cookie (like the admin-kit client).

async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail =
      (data && (data.detail || data.recipient_filter || data.subject)) ||
      `Request failed (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.join(" ") : String(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

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
  return clientFetch<EmailSession>(`${BASE}/session/`, { method: "POST" });
}

export async function setupEmail(): Promise<EmailSetupResponse> {
  return clientFetch<EmailSetupResponse>(`${BASE}/setup/`, { method: "POST" });
}

export async function listTemplates(): Promise<
  EmailTemplate[] | { results: EmailTemplate[] }
> {
  return clientFetch<EmailTemplate[] | { results: EmailTemplate[] }>(
    `${BASE}/templates/`,
  );
}

export async function getTemplate(id: string): Promise<EmailTemplate> {
  return clientFetch<EmailTemplate>(`${BASE}/templates/${id}/`);
}

export async function deleteTemplate(id: string): Promise<void> {
  return clientFetch<void>(`${BASE}/templates/${id}/`, { method: "DELETE" });
}

export async function listGallery(
  category?: string,
): Promise<GalleryTemplate[] | { results: GalleryTemplate[] }> {
  const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
  return clientFetch<GalleryTemplate[] | { results: GalleryTemplate[] }>(
    `${BASE}/gallery/${suffix}`,
  );
}

export async function getRecipientOptions(): Promise<RecipientOptions> {
  return clientFetch<RecipientOptions>(`${BASE}/recipient-options/`);
}

export async function sendCampaign(data: {
  template_id: string;
  template_name?: string;
  subject: string;
  recipient_filter: RecipientFilter;
}): Promise<EmailCampaign> {
  return clientFetch<EmailCampaign>(`${BASE}/send/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listCampaigns(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<EmailCampaign>> {
  return clientFetch<PaginatedResponse<EmailCampaign>>(
    `${BASE}/campaigns/?limit=${limit}&offset=${offset}`,
  );
}

export async function getCampaign(id: number): Promise<EmailCampaign> {
  return clientFetch<EmailCampaign>(`${BASE}/campaigns/${id}/`);
}

export async function copyTemplate(
  sourceTemplateId: string,
): Promise<{ id: string; name: string }> {
  return clientFetch<{ id: string; name: string }>(`${BASE}/templates/copy/`, {
    method: "POST",
    body: JSON.stringify({ source_template_id: sourceTemplateId }),
  });
}

export async function previewTemplates(templateIds: string[]): Promise<{
  previews: Record<string, string>;
  errors: Record<string, string>;
}> {
  return clientFetch<{
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
  return clientFetch<{ results: CampaignRecipientEntry[] }>(
    `${BASE}/campaigns/${campaignId}/recipients/`,
  );
}
