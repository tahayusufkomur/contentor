// Thin client for the coach blog endpoints (backend/apps/blog). Mirrors
// brand-pack-api.ts conventions.
import { type AiStreamHandlers, streamAi } from "@/lib/ai-stream";
import { clientFetch } from "@/lib/api-client";

export interface ImagePlacement {
  heading: string;
  photo_id: string;
}

export interface ImagePlacementResolved extends ImagePlacement {
  url: string;
  alt: string;
}

export interface BlogPostAdmin {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  meta_description: string;
  tags: string[];
  body_html: string;
  status: "draft" | "published";
  source: "manual" | "ai" | "autopilot";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  cover_photo: string | null;
  cover_photo_url: string | null;
  image_placements: ImagePlacement[];
  image_placements_resolved: ImagePlacementResolved[];
}

export interface BlogAiStatus {
  enabled: boolean;
  eligible: boolean;
  remaining: number;
  limit: number;
  reason: "upgrade_required" | "quota_exhausted" | "disabled" | "budget" | null;
}

export interface TopicIdea {
  id: number;
  title: string;
  angle: string;
}

export interface AutopilotSettings {
  is_enabled: boolean;
  frequency: "weekly" | "monthly";
  generate_time: string;
  weekday: number | null;
  day_of_month: number | null;
  auto_publish: boolean;
  next_run_at: string | null;
}

export interface GenerateResponse {
  post: BlogPostAdmin | null;
  source:
    | "ai"
    | "upgrade_required"
    | "quota_exhausted"
    | "disabled"
    | "budget"
    | "error";
  remaining: number;
}

const BASE = "/api/v1/admin/blog";

export const listPosts = () =>
  clientFetch<{ results: BlogPostAdmin[] }>(`${BASE}/posts/`);
export const getPost = (id: number) =>
  clientFetch<BlogPostAdmin>(`${BASE}/posts/${id}/`);
export const createPost = (body: Partial<BlogPostAdmin>) =>
  clientFetch<BlogPostAdmin>(`${BASE}/posts/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updatePost = (id: number, body: Partial<BlogPostAdmin>) =>
  clientFetch<BlogPostAdmin>(`${BASE}/posts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const deletePost = (id: number) =>
  clientFetch<void>(`${BASE}/posts/${id}/`, { method: "DELETE" });
export const fetchAiStatus = () =>
  clientFetch<BlogAiStatus>(`${BASE}/ai/status/`);
export const generatePost = (body: {
  topic_id?: number;
  custom_topic?: string;
  instructions?: string;
}) =>
  clientFetch<GenerateResponse>(`${BASE}/generate/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
/** What the draft looks like so far, mid-generation. Headings only — the
 * dialog shows the post taking shape, not the prose. */
export interface DraftPreview {
  title: string;
  excerpt: string;
  headings: string[];
}

/** Streaming twin of generatePost: same terminal payload, but reports the
 * draft forming so a 45s wait doesn't read as a hang.
 *
 * NOTE: cancelling via `signal` still consumes a generation credit — the
 * server commits the quota as soon as the first preview lands, so watching
 * the title and rerolling isn't free. Tell the coach before they cancel. */
export const generatePostStream = (
  body: { topic_id?: number; custom_topic?: string; instructions?: string },
  handlers: AiStreamHandlers<DraftPreview>,
  signal?: AbortSignal,
) =>
  streamAi<GenerateResponse, DraftPreview>(
    `${BASE}/generate/`,
    body,
    handlers,
    signal,
  );

export const listTopics = () => clientFetch<TopicIdea[]>(`${BASE}/topics/`);
export const refillTopics = () =>
  clientFetch<{ topics: TopicIdea[]; source: string }>(`${BASE}/topics/`, {
    method: "POST",
  });
export const dismissTopic = (id: number) =>
  clientFetch<void>(`${BASE}/topics/${id}/dismiss/`, { method: "POST" });
export const getAutopilot = () =>
  clientFetch<AutopilotSettings>(`${BASE}/autopilot/`);
export const updateAutopilot = (body: Partial<AutopilotSettings>) =>
  clientFetch<AutopilotSettings>(`${BASE}/autopilot/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
