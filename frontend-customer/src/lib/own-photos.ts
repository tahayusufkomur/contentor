// Pure helpers for the setup interview's photos question (no runtime
// imports: unit-tested in isolation).
import type { T } from "@/lib/setup-flow";

export type Shape = "portrait" | "landscape" | "square";

/** What the screen takes: the formats a browser shows and the server reads. */
export const OWN_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
export const OWN_PHOTO_MAX_BYTES = 25 * 1024 * 1024;
/** Below this on the long side a photo looks soft when a section shows it large. */
export const SMALL_EDGE = 1200;

const TAKEN = new Set(OWN_PHOTO_ACCEPT.split(","));
const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

const typeOf = (file: { name: string; type: string }) =>
  file.type ||
  BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ||
  "";

/** Why a file cannot be added, in words for the coach; null when it can. */
export function photoProblem(
  file: {
    name: string;
    type: string;
    size: number;
  },
  t: T,
): string | null {
  const type = typeOf(file);
  if (/^image\/hei[cf]/.test(type)) return t("photos.heic");
  if (!TAKEN.has(type)) return t("photos.formats");
  if (file.size > OWN_PHOTO_MAX_BYTES) return t("photos.tooBig");
  return null;
}

/** A photo's shape as the site's sections see it (mirrors the backend's
 * own_photos.orientation_of): close to square counts as square. */
export function shapeOf(
  width?: number | null,
  height?: number | null,
): Shape | null {
  if (!width || !height) return null;
  const ratio = width / height;
  return ratio > 1.1 ? "landscape" : ratio < 0.9 ? "portrait" : "square";
}

/** How many photos of each shape she has added. */
export function tally(
  photos: { width?: number | null; height?: number | null }[],
): Record<Shape, number> {
  const counts: Record<Shape, number> = {
    portrait: 0,
    landscape: 0,
    square: 0,
  };
  for (const p of photos) {
    const shape = shapeOf(p.width, p.height);
    if (shape) counts[shape] += 1;
  }
  return counts;
}

export const isSmall = (width?: number | null, height?: number | null) =>
  !!width && !!height && Math.max(width, height) < SMALL_EDGE;

/** One line under a guide row: how far her photos cover what a home page
 * shows of that shape. */
export function coverage(have: number, used: number, t: T): string {
  if (have === 0)
    return used
      ? t("photos.coverage.shows", { used })
      : t("photos.coverage.optional");
  if (have >= used) return t("photos.coverage.enough", { have });
  return t("photos.coverage.some", { have, used });
}

/** What the caption under a photo says about where it stands. */
export function statusLine(status: string, t: T): string {
  return t(
    ["uploading", "pending", "error"].includes(status)
      ? `photos.status.${status}`
      : "photos.status.added",
  );
}
