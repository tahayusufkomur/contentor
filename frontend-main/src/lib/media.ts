// The landing's footage and photography, as listed in public/media/media.json
// (written by scripts/footage/manifest.mjs; spec 5.3). Imported at build time,
// never fetched. Read it from server components: a client import would ship
// the whole manifest to the browser.
import manifest from "../../public/media/media.json";

export type MediaKind = "clip" | "scrub" | "loop" | "still";

export interface MediaItem {
  kind: MediaKind;
  src: string; // "/media/clips/hero-looks.mp4" | "/media/stills/still-yoga.avif"
  width: number;
  height: number;
  bytes: number;
  poster?: string; // every clip | scrub | loop
  webm?: string; // clips and loops
  phoneSrc?: string; // 720 px encode; hero and the student clip
  durationS?: number;
  srcSmall?: string; // every still: the small AVIF
  alt?: string; // every still
  license?: string; // coach photographs
}

const ITEMS = (manifest as unknown as { items: Record<string, MediaItem> })
  .items;

/** One manifest entry. Throws on a key media.json does not have, so a renamed
 * or missing recording fails the render instead of leaving a blank tile. */
export function media(key: string): MediaItem {
  if (!Object.hasOwn(ITEMS, key))
    throw new Error(`media: unknown key "${key}"`);
  return ITEMS[key];
}
