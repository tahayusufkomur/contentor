export interface ImagePlacement {
  heading: string;
  photo_id: string;
}

const HEADING_RE = /<h2>(.*?)<\/h2>/g;

export function extractHeadings(bodyHtml: string): string[] {
  return [...bodyHtml.matchAll(HEADING_RE)].map((m) => m[1]);
}

export function upsertPlacement(
  existing: ImagePlacement[],
  next: ImagePlacement,
  max = 2,
): ImagePlacement[] {
  const withoutSameHeading = existing.filter((p) => p.heading !== next.heading);
  const combined = [...withoutSameHeading, next];
  return combined.slice(Math.max(0, combined.length - max));
}
