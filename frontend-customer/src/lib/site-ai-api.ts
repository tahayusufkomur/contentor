// Thin client for the coach site-AI endpoints (backend
// apps/core/site_ai_admin.py). Mirrors lib/blog-api.ts's split of plain
// clientFetch + a streamAi wrapper.
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";

const BASE = "/api/v1/admin/site-ai";

export interface SiteAiStatus {
  enabled: boolean;
  remaining: number;
  limit: number;
  /** null when edits are available. */
  reason: "upgrade_required" | "quota_exhausted" | null;
}

/** The proposed page tree the preview stream resolves with. */
export interface SiteEditPreview {
  pages: Record<string, unknown>;
}

export const fetchSiteAiStatus = () =>
  clientFetch<SiteAiStatus>(`${BASE}/status/`);

export const previewSiteEdit = (
  instruction: string,
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) =>
  streamAi<SiteEditPreview, never>(
    `${BASE}/preview/`,
    { instruction },
    handlers,
    signal,
  );

export const applySiteEdit = (pages: Record<string, unknown>) =>
  clientFetch<{ remaining: number }>(`${BASE}/apply/`, {
    method: "POST",
    body: JSON.stringify({ pages }),
  });
