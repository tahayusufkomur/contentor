import { briefKeywords, rankCuratedLogos } from "@shared/logo/curated-rank";

import type { CustomMarkPath } from "@/types/logo";

export interface CuratedLogo {
  title: string;
  filename: string;
  prompt: string;
  tags: string[];
  imageUrl: string;
  markPaths?: CustomMarkPath[];
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

export function rankForBrief(
  logos: CuratedLogo[],
  opts: { niche?: string; description?: string; styleChips?: string[] },
): CuratedLogo[] {
  return rankCuratedLogos(logos, briefKeywords(opts));
}
