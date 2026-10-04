// Thin client for the remote photo catalog
// (backend/apps/core/curated_images → Pix4Less, the whole library).
// Photography lives in that service; the decorative catalog (spot, texture,
// divider, icon) is still local — see curated-photos-api.ts.
import { clientFetch } from "@/lib/api-client";

import type { MaterializedPhoto } from "@/lib/curated-photos-api";

export interface CuratedImage {
  id: string;
  title: string;
  alt_text: string;
  tags: string[];
  width: number | null;
  height: number | null;
  image_url: string;
}

export interface CuratedImagePage {
  results: CuratedImage[];
  page: number;
  has_next: boolean;
}

export function searchCuratedImages(params: {
  q?: string;
  page?: number;
}): Promise<CuratedImagePage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return clientFetch<CuratedImagePage>(
    `/api/v1/curated-images/${qs ? `?${qs}` : ""}`,
  );
}

export interface CuratedImageJob {
  job_id: string;
  status: string;
  done: boolean;
  photo: MaterializedPhoto | null;
}

/** Create a brand-new image from a description when the library has nothing
 * that fits. Counts against the tenant's monthly cap (429 once it is used up).
 * Most jobs take about a minute; this resolves with the tenant photo, or null
 * when the service could not produce one. */
export async function generateCuratedImage(
  prompt: string,
): Promise<MaterializedPhoto | null> {
  let job = await clientFetch<CuratedImageJob>(
    "/api/v1/curated-images/generate/",
    { method: "POST", body: JSON.stringify({ prompt }) },
  );
  // Each status call long-polls a few seconds server-side, so this loop is
  // not a busy wait. 40 rounds comfortably outlasts a slow job.
  for (let round = 0; !job.done && round < 40; round += 1) {
    job = await clientFetch<CuratedImageJob>(
      `/api/v1/curated-images/generate/${job.job_id}/`,
    );
  }
  return job.photo;
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
