import { clientFetch } from "@/lib/api-client";
import type {
  BrandKit,
  CatalogItem,
  EmailDesign,
  ImageValue,
} from "@shared/email/editor";

/** The coach's designed emails: her templates, her drafts and their sends
 *  (backend: apps.email_campaigns, the native email engine). */

export type RecipientFilter =
  | { type: "all" }
  | { type: "course"; course_ids: number[] }
  | { type: "individual"; user_ids: number[] };

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "partial"
  | "failed";

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
  preheader: string;
  /** Present on the detail, not on list rows. */
  design?: EmailDesign;
  template: number | null;
  template_name: string;
  sender: number | null;
  sender_name: string;
  sender_email: string;
  recipient_filter: RecipientFilter | Record<string, never>;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  status: CampaignStatus;
  /** Present on the detail, not on list rows. */
  rendered_html?: string;
  recipient_summary: string;
  created_at: string;
  updated_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
}

export type TemplateCategory =
  | "newsletter"
  | "launch"
  | "event"
  | "note"
  | "offer"
  | "welcome"
  | "other";

export type TemplateSource = "starter" | "designer" | "coach" | "imported";

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  newsletter: "Newsletter",
  launch: "Launch",
  event: "Class or event",
  note: "Personal note",
  offer: "Offer",
  welcome: "Welcome",
  other: "Email",
};

export interface EmailTemplate {
  id: number;
  name: string;
  category: TemplateCategory;
  subject: string;
  preheader: string;
  source: TemplateSource;
  created_at: string;
  updated_at: string;
  /** On the list. */
  preview_html?: string;
  /** On the detail. */
  design?: EmailDesign;
}

/** A live slot ("next:event") as the catalog returns it: what it shows today. */
export interface CatalogSlot extends CatalogItem {
  kindLabel: string;
  slotLabel: string;
}

export interface CatalogEntry extends CatalogItem {
  kindLabel: string;
}

export interface DesignerJob {
  id: number;
  status: "queued" | "working" | "done" | "failed";
  /** "Designer · laying out the hero": who is doing what right now. */
  step: string;
  warnings: string[];
  error: string;
  campaign: number | null;
  template: number | null;
}

export interface PaginatedResponse<T> {
  count: number;
  results: T[];
}

const json = (data: unknown) => JSON.stringify(data);

// ── her brand, her catalog, her pictures ────────────────────────────────

export const getBrandKit = () => clientFetch<BrandKit>("/api/v1/email/brand/");

export const getCatalog = () =>
  clientFetch<{ items: CatalogEntry[]; slots: CatalogSlot[] }>(
    "/api/v1/email/catalog/",
  );

export const emailImage = (photoId: string | number) =>
  clientFetch<ImageValue>("/api/v1/email/images/", {
    method: "POST",
    body: json({ photo_id: photoId }),
  });

export const renderEmail = (
  design: EmailDesign,
  subject = "",
  preheader = "",
) =>
  clientFetch<{ html: string; text: string; warnings: string[] }>(
    "/api/v1/email/render/",
    { method: "POST", body: json({ design, subject, preheader }) },
  );

// ── templates ───────────────────────────────────────────────────────────

// The server lists the starters made for her at setup first, in order, then hers.
export const listTemplates = () =>
  clientFetch<{ results: EmailTemplate[] }>("/api/v1/email/templates/");

export const getTemplate = (id: number) =>
  clientFetch<EmailTemplate>(`/api/v1/email/templates/${id}/`);

export const createTemplate = (data: {
  name: string;
  design: EmailDesign;
  category?: TemplateCategory;
  subject?: string;
  preheader?: string;
}) =>
  clientFetch<EmailTemplate>("/api/v1/email/templates/", {
    method: "POST",
    body: json(data),
  });

export const updateTemplate = (
  id: number,
  data: Partial<
    Pick<EmailTemplate, "name" | "subject" | "preheader" | "category">
  > & { design?: EmailDesign },
) =>
  clientFetch<EmailTemplate>(`/api/v1/email/templates/${id}/`, {
    method: "PATCH",
    body: json(data),
  });

export const deleteTemplate = (id: number) =>
  clientFetch<void>(`/api/v1/email/templates/${id}/`, { method: "DELETE" });

export const duplicateTemplate = (id: number) =>
  clientFetch<EmailTemplate>(`/api/v1/email/templates/${id}/duplicate/`, {
    method: "POST",
  });

// ── emails ──────────────────────────────────────────────────────────────

export const listCampaigns = (limit = 20, offset = 0) =>
  clientFetch<PaginatedResponse<EmailCampaign>>(
    `/api/v1/email/campaigns/?limit=${limit}&offset=${offset}`,
  );

export const getCampaign = (id: number) =>
  clientFetch<EmailCampaign>(`/api/v1/email/campaigns/${id}/`);

/** A new draft: from one of her templates, or blank (her header and footer). */
export const createDraft = (
  data: {
    template_id?: number;
    subject?: string;
    recipient_filter?: RecipientFilter;
  } = {},
) =>
  clientFetch<EmailCampaign>("/api/v1/email/campaigns/", {
    method: "POST",
    body: json(data),
  });

export const updateDraft = (
  id: number,
  data: {
    subject?: string;
    preheader?: string;
    design?: EmailDesign;
    recipient_filter?: RecipientFilter;
  },
) =>
  clientFetch<EmailCampaign>(`/api/v1/email/campaigns/${id}/`, {
    method: "PATCH",
    body: json(data),
  });

/** Delete a draft, or cancel one that is scheduled (the API refuses any other). */
export async function cancelCampaign(id: number): Promise<void> {
  await clientFetch(`/api/v1/email/campaigns/${id}/`, { method: "DELETE" });
}

export const sendCampaign = (
  id: number,
  data: { recipient_filter: RecipientFilter; scheduled_at?: string | null },
) =>
  clientFetch<EmailCampaign>(`/api/v1/email/campaigns/${id}/send/`, {
    method: "POST",
    body: json(data),
  });

export const sendTest = (id: number) =>
  clientFetch<{ sent_to: string }>(`/api/v1/email/campaigns/${id}/test/`, {
    method: "POST",
  });

export const saveAsTemplate = (id: number, name?: string) =>
  clientFetch<EmailTemplate>(
    `/api/v1/email/campaigns/${id}/save-as-template/`,
    { method: "POST", body: json(name ? { name } : {}) },
  );

export const listCampaignRecipients = (campaignId: number) =>
  clientFetch<{ results: CampaignRecipientEntry[] }>(
    `/api/v1/email/campaigns/${campaignId}/recipients/`,
  );

// ── the Designer ────────────────────────────────────────────────────────

export const startDesigner = (data: {
  brief: string;
  campaign_id?: number;
  template_id?: number;
  mode?: "new" | "edit";
  /** Edit only this block (the one she selected). */
  block_id?: string;
  refs?: string[];
}) =>
  clientFetch<DesignerJob>("/api/v1/email/designer/", {
    method: "POST",
    body: json(data),
  });

export const getDesignerJob = (id: number) =>
  clientFetch<DesignerJob>(`/api/v1/email/designer/${id}/`);
