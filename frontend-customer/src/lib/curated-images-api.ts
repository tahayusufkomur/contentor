// Thin client for the remote curated photo catalog
// (backend/apps/core/curated_images → the curated-image-api service).
// Photography lives in that service; the decorative catalog (spot, texture,
// divider, icon) is still local — see curated-photos-api.ts.
import { clientFetch } from "@/lib/api-client";

import type { MaterializedPhoto } from "@/lib/curated-photos-api";

// Collections stand in for the `kind` field the remote catalog does not have.
export type CuratedCollection = "coach-heroes" | "coach-stock";

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
  collection?: CuratedCollection;
  page?: number;
}): Promise<CuratedImagePage> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.collection) search.set("collection", params.collection);
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
