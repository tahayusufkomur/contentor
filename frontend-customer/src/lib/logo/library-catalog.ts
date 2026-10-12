import { briefKeywords, rankCuratedLogos } from "@shared/logo/curated-rank";

import { clientFetch } from "@/lib/api-client";
import type { CustomMarkPath } from "@/types/logo";

export interface CuratedLogo {
  title: string;
  filename: string;
  prompt: string;
  tags: string[];
  imageUrl: string;
  markPaths?: CustomMarkPath[];
  /** Set for a mark from the remote catalog: its id there. Its image is
   * copied into the coach's storage and traced when she uses it
   * (``takeLibraryLogo``); until then the card shows the catalog's preview. */
  assetId?: string;
}

interface RawEntry {
  title: string;
  filename: string;
  prompt: string;
  tags: string;
  image_url: string;
  mark_paths?: CustomMarkPath[] | null;
}

export async function fetchCuratedCatalog(): Promise<CuratedLogo[]> {
  try {
    const res = await fetch("/api/v1/logos/curated/");
    if (!res.ok) return [];
    const raw = (await res.json()) as RawEntry[];
    return raw.map((e) => ({
      title: e.title,
      filename: e.filename,
      prompt: e.prompt ?? "",
      tags: (e.tags ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      imageUrl: e.image_url,
      markPaths: e.mark_paths ?? undefined,
    }));
  } catch {
    return [];
  }
}

interface LibraryResponse {
  source: "local" | "pix4less";
  results?: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    image_url: string;
  }[];
}

/** Ready-made marks from the remote catalog for a query ("yoga elegant"),
 * best first. null when the logo library is the local catalog, or the
 * remote one cannot be reached: the caller then uses ``fetchCuratedCatalog``. */
export async function fetchLibrary(
  query: string,
): Promise<CuratedLogo[] | null> {
  try {
    const data = await clientFetch<LibraryResponse>(
      `/api/v1/logos/library/?q=${encodeURIComponent(query)}`,
    );
    if (data.source !== "pix4less") return null;
    return (data.results ?? []).map((r) => ({
      title: r.title,
      filename: r.id,
      prompt: r.description,
      tags: r.tags.map((t) => t.toLowerCase()),
      imageUrl: r.image_url,
      assetId: r.id,
    }));
  } catch {
    return null;
  }
}

/** Copy a remote catalog mark into the coach's storage. ``markPaths`` is its
 * traced vector when it is a flat mark; otherwise it is used as the image. */
export async function takeLibraryLogo(assetId: string): Promise<{
  photoId: string;
  imageUrl: string;
  markPaths?: CustomMarkPath[];
}> {
  const data = await clientFetch<{
    photo: { id: string; signed_url: string };
    mark_paths: CustomMarkPath[] | null;
  }>(`/api/v1/logos/library/${assetId}/use/`, { method: "POST" });
  return {
    photoId: data.photo.id,
    imageUrl: data.photo.signed_url,
    markPaths: data.mark_paths ?? undefined,
  };
}

export function rankForBrief(
  logos: CuratedLogo[],
  opts: { niche?: string; description?: string; styleChips?: string[] },
): CuratedLogo[] {
  return rankCuratedLogos(logos, briefKeywords(opts));
}
