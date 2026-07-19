// Thin client for the curated photo library (backend/apps/core/curated_photos).
import { clientFetch } from "@/lib/api-client";

export type CuratedKind =
  | "hero"
  | "stock"
  | "spot"
  | "texture"
  | "divider"
  | "icon";

export interface CuratedPhoto {
  id: number;
  title: string;
  kind: CuratedKind;
  tags: string;
  width: number | null;
  height: number | null;
  image_url: string;
}

export interface MaterializedPhoto {
  id: string;
  signed_url: string | null;
  title: string;
  alt_text: string;
}

export function searchCuratedPhotos(params: {
  kind?: string;
  q?: string;
}): Promise<CuratedPhoto[]> {
  const search = new URLSearchParams();
  if (params.kind) search.set("kind", params.kind);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return clientFetch<CuratedPhoto[]>(
    `/api/v1/curated-photos/${qs ? `?${qs}` : ""}`,
  );
}

// Named materialize*, not use* — ESLint treats use-prefixed functions as
// React hooks and would reject calls from event handlers.
export function materializeCuratedPhoto(id: number): Promise<MaterializedPhoto> {
  return clientFetch<MaterializedPhoto>(`/api/v1/curated-photos/${id}/use/`, {
    method: "POST",
  });
}
