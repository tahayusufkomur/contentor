import { clientFetch } from "@/lib/api-client";

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
  | { type: "all" }
  | { type: "course"; course_ids: number[] }
  | { type: "individual"; user_ids: number[] };

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

export async function createEmailSession(): Promise<EmailSession> {
  return clientFetch<EmailSession>("/api/v1/email/session/", {
    method: "POST",
  });
}

export async function setupEmail(): Promise<EmailSetupResponse> {
  return clientFetch<EmailSetupResponse>("/api/v1/email/setup/", {
    method: "POST",
  });
}

export async function listTemplates(): Promise<EmailTemplate[] | { results: EmailTemplate[] }> {
  return clientFetch<EmailTemplate[] | { results: EmailTemplate[] }>("/api/v1/email/templates/");
}

export async function getTemplate(id: string): Promise<EmailTemplate> {
  return clientFetch<EmailTemplate>(`/api/v1/email/templates/${id}/`);
}

export async function deleteTemplate(id: string): Promise<void> {
  return clientFetch<void>(`/api/v1/email/templates/${id}/`, {
    method: "DELETE",
  });
}

export async function listGallery(
  category?: string,
): Promise<GalleryTemplate[] | { results: GalleryTemplate[] }> {
  const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
  return clientFetch<GalleryTemplate[] | { results: GalleryTemplate[] }>(`/api/v1/email/gallery/${suffix}`);
}

export async function sendCampaign(data: {
  template_id: string;
  template_name?: string;
  subject: string;
  recipient_filter: RecipientFilter;
}): Promise<EmailCampaign> {
  return clientFetch<EmailCampaign>("/api/v1/email/send/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listCampaigns(
  limit = 20,
  offset = 0,
): Promise<PaginatedResponse<EmailCampaign>> {
  return clientFetch<PaginatedResponse<EmailCampaign>>(
    `/api/v1/email/campaigns/?limit=${limit}&offset=${offset}`,
  );
}

export async function getCampaign(id: number): Promise<EmailCampaign> {
  return clientFetch<EmailCampaign>(`/api/v1/email/campaigns/${id}/`);
}

export async function copyTemplate(sourceTemplateId: string): Promise<{ id: string; name: string }> {
  return clientFetch<{ id: string; name: string }>("/api/v1/email/templates/copy/", {
    method: "POST",
    body: JSON.stringify({ source_template_id: sourceTemplateId }),
  });
}

export async function previewTemplates(
  templateIds: string[],
): Promise<{ previews: Record<string, string>; errors: Record<string, string> }> {
  return clientFetch<{ previews: Record<string, string>; errors: Record<string, string> }>(
    "/api/v1/email/templates/preview/",
    {
      method: "POST",
      body: JSON.stringify({ template_ids: templateIds }),
    },
  );
}

export async function listCampaignRecipients(
  campaignId: number,
): Promise<{ results: CampaignRecipientEntry[] }> {
  return clientFetch<{ results: CampaignRecipientEntry[] }>(
    `/api/v1/email/campaigns/${campaignId}/recipients/`,
  );
}
