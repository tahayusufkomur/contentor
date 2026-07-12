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

export function rankForBrief(
  logos: CuratedLogo[],
  opts: { niche?: string; styleChips?: string[] },
): CuratedLogo[] {
  const keywords = new Set<string>();
  for (const token of (opts.niche ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (token) keywords.add(token);
  }
  for (const chip of opts.styleChips ?? []) keywords.add(chip.toLowerCase());
  if (keywords.size === 0) return logos;
  const score = (l: CuratedLogo) =>
    l.tags.reduce((n, t) => n + (keywords.has(t) ? 1 : 0), 0);
  return logos
    .map((l, i) => ({ l, i, s: score(l) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.l);
}
