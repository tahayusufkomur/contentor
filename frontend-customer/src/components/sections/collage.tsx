import type { CSSProperties } from "react";
import type { Block } from "@/types/tenant";
import type { EditableContext } from "@/lib/blocks/types";
import { imageUrl } from "./kit";

/** The hero photos a cluster can place: the filled slots (up to four), or all
 *  four while the coach is editing so each one can be picked. */
export function heroPhotos(
  block: Block,
  editable?: EditableContext,
): unknown[] {
  const all = [block.image, block.image2, block.image3, block.image4];
  return editable ? all : all.filter((v) => Boolean(imageUrl(v)));
}

type Tile = { left: number; top: number; width: number; rotate: number };

/** Where tile n of k sits on the stage, in % of its width/height, so the
 *  cluster scales; every tile overlaps a neighbour. 0 photos: no stage. */
const TILES: Record<number, Tile[]> = {
  1: [{ left: 34, top: 4, width: 32, rotate: -2 }],
  2: [
    { left: 12, top: 8, width: 32, rotate: -4 },
    { left: 52, top: 24, width: 30, rotate: 4 },
  ],
  3: [
    { left: 5, top: 10, width: 27, rotate: -4 },
    { left: 38, top: 40, width: 24, rotate: 3 },
    { left: 68, top: 6, width: 26, rotate: -3 },
  ],
  4: [
    { left: 4, top: 8, width: 26, rotate: -5 },
    { left: 25, top: 46, width: 21, rotate: 4 },
    { left: 49, top: 4, width: 24, rotate: 3 },
    { left: 72, top: 40, width: 24, rotate: -4 },
  ],
};

/** Portrait, square, portrait, square: the rhythm a cluster reads best in. */
export const TILE_ASPECT = ["aspect-[4/5]", "aspect-square"] as const;

/** Inline position of tile `n` among `count`. */
export function tileStyle(count: number, n: number): CSSProperties {
  const t = (TILES[Math.min(count, 4)] ?? [])[n];
  return t
    ? ({
        left: `${t.left}%`,
        top: `${t.top}%`,
        "--tw": `${t.width}%`,
        transform: `rotate(${t.rotate}deg)`,
      } as CSSProperties)
    : {};
}

/** A tile's width: its stage share, half again as wide on a phone (where only
 *  the first two tiles show) so the photos stay photographs. */
export const TILE_W = "w-[calc(var(--tw)*1.5)] sm:w-[var(--tw)]";

/** The stage the tiles sit on; only when there is a photo to place. */
export const STAGE = "aspect-[4/5] sm:aspect-[4/3] md:aspect-[2/1]";
