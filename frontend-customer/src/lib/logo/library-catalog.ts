export interface CuratedLogo {
  title: string;
  filename: string;
  prompt: string;
  tags: string[];
  imageUrl: string;
}

interface RawEntry {
  title: string;
  filename: string;
  prompt: string;
  tags: string;
  image_url: string;
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
    }));
  } catch {
    return [];
  }
}

export function rankByNiche(
  logos: CuratedLogo[],
  niche: string,
): CuratedLogo[] {
  const key = (niche || "").trim().toLowerCase();
  if (!key) return logos;
  const match = logos.filter((l) => l.tags.includes(key));
  const rest = logos.filter((l) => !l.tags.includes(key));
  return [...match, ...rest];
}
