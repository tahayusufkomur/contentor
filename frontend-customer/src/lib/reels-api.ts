// The reels studio (backend/apps/reels/views.py): the coach's videos, finding their moments, editing a
// reel and making it into a video file.
import { clientFetch } from "@/lib/api-client";
import type {
  ReelDetail,
  ReelPatch,
  ReelSearch,
  ReelSummary,
  ReelVideos,
} from "@/types/reels";

const BASE = "/api/v1/reels";

export function getReelVideos(): Promise<ReelVideos> {
  return clientFetch<ReelVideos>(`${BASE}/videos/`);
}

export function listReels(video?: number): Promise<ReelSummary[]> {
  return clientFetch<ReelSummary[]>(
    `${BASE}/${video ? `?video=${video}` : ""}`,
  );
}

/** Starts finding `count` reels in the video (its words first, when it has none yet). */
export function startSearch(video: number, count: number): Promise<ReelSearch> {
  return clientFetch<ReelSearch>(`${BASE}/search/`, {
    method: "POST",
    body: JSON.stringify({ video, count }),
  });
}

export function getSearch(video: number): Promise<ReelSearch> {
  return clientFetch<ReelSearch>(`${BASE}/search/${video}/`);
}

export function getReel(id: string): Promise<ReelDetail> {
  return clientFetch<ReelDetail>(`${BASE}/${id}/`);
}

/** Saves the changed fields; the reel comes back as the server drew it (its crop, cuts and translation). */
export function saveReel(id: string, patch: ReelPatch): Promise<ReelDetail> {
  return clientFetch<ReelDetail>(`${BASE}/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteReel(id: string): Promise<void> {
  return clientFetch<void>(`${BASE}/${id}/`, { method: "DELETE" });
}

/** Starts making the reel's video file; it is "rendering" until it is ready (or failed). */
export function renderReel(id: string): Promise<ReelSummary> {
  return clientFetch<ReelSummary>(`${BASE}/${id}/render/`, { method: "POST" });
}

/** A link that downloads the reel's file. */
export function downloadLink(id: string): Promise<{ url: string }> {
  return clientFetch<{ url: string }>(`${BASE}/${id}/download/`);
}
