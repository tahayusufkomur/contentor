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
}

export async function fetchCuratedCatalog(): Promise<CuratedLogo[]> {
  try {
    const res = await fetch("/logos/logo_meta.json");
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
      imageUrl: `/logos/${e.filename}`,
    }));
  } catch {
    return [];
  }
}

export function rankByNiche(logos: CuratedLogo[], niche: string): CuratedLogo[] {
  const key = (niche || "").trim().toLowerCase();
  if (!key) return logos;
  const match = logos.filter((l) => l.tags.includes(key));
  const rest = logos.filter((l) => !l.tags.includes(key));
  return [...match, ...rest];
}
