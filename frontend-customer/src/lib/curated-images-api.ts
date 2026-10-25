// Thin client for the remote photo catalog
// (backend/apps/core/curated_images → Pix4Less, the whole library).
// Photography lives in that service; the decorative catalog (spot, texture,
// divider, icon) is still local — see curated-photos-api.ts.
import { clientFetch } from "@/lib/api-client";

import type { GenerationAspect } from "@/lib/covers/recipe";
import type { MaterializedPhoto } from "@/lib/curated-photos-api";

export interface CuratedImage {
  id: string;
  title: string;
  alt_text: string;
  tags: string[];
  width: number | null;
  height: number | null;
  image_url: string;
  /** Where its subject sits ("left_third", "right_third", "centered", "off_center"), when the library knows. */
  subject_placement?: string | null;
}

export interface CuratedImagePage {
  results: CuratedImage[];
  page: number;
  has_next: boolean;
}

export function searchCuratedImages(params: {
  q?: string;
  page?: number;
  orientation?: string;
}): Promise<CuratedImagePage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.orientation) search.set("orientation", params.orientation);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return clientFetch<CuratedImagePage>(
    `/api/v1/curated-images/${qs ? `?${qs}` : ""}`,
  );
}

// Named materialize*, not use* — ESLint treats use-prefixed functions as React
// hooks and would reject calls from event handlers. This copies the image into
// the tenant's own storage and returns the resulting tenant photo.
export function materializeCuratedImage(
  assetId: string,
): Promise<MaterializedPhoto> {
  return clientFetch<MaterializedPhoto>(
    `/api/v1/curated-images/${assetId}/use/`,
    { method: "POST" },
  );
}

export interface GenerationAllowance {
  limit: number;
  used: number;
  left: number;
}

export interface GenerationJob {
  job_id: string;
  status: string;
  done: boolean;
  /** Her photo, once the job is fulfilled; null while it runs, or when it failed. */
  photo: MaterializedPhoto | null;
}

/** New photos made this month, against the monthly cap (shared with the Designer). */
export function generationAllowance(): Promise<GenerationAllowance> {
  return clientFetch<GenerationAllowance>("/api/v1/curated-images/generate/");
}

/** Queues a brand-new photo, which takes about a minute: follow it with generationStatus. Each one
 *  counts against the allowance; 429 when it is used up. */
export function startGeneration(
  prompt: string,
  aspect: GenerationAspect,
): Promise<GenerationJob> {
  return clientFetch<GenerationJob>("/api/v1/curated-images/generate/", {
    method: "POST",
    body: JSON.stringify({ prompt, aspect_ratio: aspect }),
  });
}

/** Where a job stands. The server holds the call a few seconds before it answers (a long poll). */
export function generationStatus(jobId: string): Promise<GenerationJob> {
  return clientFetch<GenerationJob>(
    `/api/v1/curated-images/generate/${encodeURIComponent(jobId)}/`,
  );
}
