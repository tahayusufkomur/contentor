// Platform email API client (superadmin → coaches), base `/api/v1/platform/email`.
// Mirrors frontend-customer's coach email-api, but recipients are coaches and
// auth rides the same-origin admin cookie (shared api-client).

import type { BrandKit, EmailDesign } from "@shared/email/editor";

import { jsonFetch } from "./api-client";

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

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "partial"
  | "failed";

export interface EmailCampaign {
  id: number;
  subject: string;
  preheader: string;
  design?: EmailDesign;
  template_name: string;
  sender: number | null;
  sender_name: string;
  sender_email: string;
  recipient_filter: RecipientFilter;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  status: CampaignStatus;
  rendered_html?: string;
  recipient_summary: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface PlatformTemplate {
  id: number;
  name: string;
  subject: string;
  preheader: string;
  design?: EmailDesign;
  preview_html?: string;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  results: T[];
}

const BASE = "/api/v1/platform/email";
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const getBrand = () => jsonFetch<BrandKit>(`${BASE}/brand/`);

export const renderEmail = (
  design: EmailDesign,
  subject = "",
  preheader = "",
) =>
  jsonFetch<{ html: string; text: string }>(
    `${BASE}/render/`,
    json("POST", { design, subject, preheader }),
  );

export const listTemplates = () =>
  jsonFetch<{ results: PlatformTemplate[] }>(`${BASE}/templates/`);

export const getTemplate = (id: number) =>
  jsonFetch<PlatformTemplate>(`${BASE}/templates/${id}/`);

export const createTemplate = (data: Partial<PlatformTemplate>) =>
  jsonFetch<PlatformTemplate>(`${BASE}/templates/`, json("POST", data));

export const updateTemplate = (id: number, data: Partial<PlatformTemplate>) =>
  jsonFetch<PlatformTemplate>(`${BASE}/templates/${id}/`, json("PATCH", data));

export const deleteTemplate = (id: number) =>
  jsonFetch<void>(`${BASE}/templates/${id}/`, json("DELETE"));

export const getRecipientOptions = () =>
  jsonFetch<RecipientOptions>(`${BASE}/recipient-options/`);

export const listCampaigns = (limit = 20, offset = 0) =>
  jsonFetch<PaginatedResponse<EmailCampaign>>(
    `${BASE}/campaigns/?limit=${limit}&offset=${offset}`,
  );

export const createDraft = (templateId?: number) =>
  jsonFetch<EmailCampaign>(
    `${BASE}/campaigns/`,
    json("POST", templateId ? { template_id: templateId } : {}),
  );

export const getCampaign = (id: number) =>
  jsonFetch<EmailCampaign>(`${BASE}/campaigns/${id}/`);

export const updateDraft = (
  id: number,
  data: { subject?: string; preheader?: string; design?: EmailDesign },
) => jsonFetch<EmailCampaign>(`${BASE}/campaigns/${id}/`, json("PATCH", data));

export const deleteDraft = (id: number) =>
  jsonFetch<void>(`${BASE}/campaigns/${id}/`, json("DELETE"));

export const sendDraft = (id: number, recipientFilter: RecipientFilter) =>
  jsonFetch<EmailCampaign>(
    `${BASE}/campaigns/${id}/send/`,
    json("POST", { recipient_filter: recipientFilter }),
  );

export const sendTest = (id: number) =>
  jsonFetch<{ sent_to: string }>(`${BASE}/campaigns/${id}/test/`, json("POST"));

export const listCampaignRecipients = (campaignId: number) =>
  jsonFetch<{ results: CampaignRecipientEntry[] }>(
    `${BASE}/campaigns/${campaignId}/recipients/`,
  );
