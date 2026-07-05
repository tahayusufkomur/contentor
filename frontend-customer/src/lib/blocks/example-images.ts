// Auto-fill freshly-added blocks with random photos from the tenant's existing
// library, so image-bearing blocks (hero / image+text / gallery / testimonials)
// land visually complete instead of empty. Only EMPTY image slots are touched —
// the coach then swaps in their own from the photo picker. Blocks whose "images"
// aren't photos (logos = brand marks) or that need other media (video) / live
// data (courses, plans, events, products) are intentionally left alone.

import type { Block } from "@/types/tenant";

/** Minimal shape needed from GET /api/v1/photos/ results. */
export interface ExamplePhoto {
  id: string;
  signed_url: string | null;
}

const toImage = (p: ExamplePhoto) => ({ url: p.signed_url, photo_id: p.id });

/** Up to `n` distinct random photos (fewer if the library is smaller). */
function sample(photos: ExamplePhoto[], n: number): ExamplePhoto[] {
  const pool = [...photos];
  const out: ExamplePhoto[] = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

/** Mutates + returns a freshly-created block, filling its empty image slots with
 *  random photos from `photos`. No-op when the library is empty or the block has
 *  no photo slots. */
export function applyExampleImages(
  block: Block,
  photos: ExamplePhoto[],
): Block {
  const usable = photos.filter((p) => p.signed_url);
  if (!usable.length) return block;
  const rand = () => usable[Math.floor(Math.random() * usable.length)];

  switch (block.type) {
    case "hero":
      if (!block.bgImage?.url) block.bgImage = toImage(rand());
      break;
    case "imageText":
      if (!block.image?.url) block.image = toImage(rand());
      break;
    case "gallery":
      if (!block.items?.length)
        block.items = sample(usable, 6).map((p) => ({
          image: toImage(p),
          caption: "",
        }));
      break;
    case "testimonials":
      if (Array.isArray(block.items))
        block.items = block.items.map((it: Record<string, unknown>) =>
          (it.avatar as { url?: string | null } | undefined)?.url
            ? it
            : { ...it, avatar: toImage(rand()) },
        );
      break;
  }
  return block;
}
