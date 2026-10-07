import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Fig, Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Plate layouts that fill their rows for every count the family allows. */
const SPREADS: Record<number, [place: string, aspect: string][]> = {
  3: [
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
  ],
  4: [
    ["md:col-span-7", "aspect-[3/2]"],
    ["md:col-span-5", "aspect-[4/5]"],
    ["md:col-span-5", "aspect-[4/5]"],
    ["md:col-span-7", "aspect-[3/2]"],
  ],
  5: [
    ["md:col-span-7", "aspect-[3/2]"],
    ["md:col-span-5", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
  ],
  6: [
    ["md:col-span-7", "aspect-[3/2]"],
    ["md:col-span-5", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-4", "aspect-[4/5]"],
    ["md:col-span-12", "aspect-[3/2] md:aspect-[21/9]"],
  ],
};

/** Moments as numbered figures: a grid of framed plates with mono captions
 *  and running head opener. */
export function MomentsFigures({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section label={alt || "Moments"}>
      <div className={WRAP}>
        {(showHead || showCaption) && (
          <Opener
            block={block}
            editable={editable}
            field="caption"
            className="mb-12 md:mb-16"
          />
        )}

        <ul
          aria-label={alt || "Figures"}
          className="grid grid-cols-2 gap-4 md:grid-cols-12 md:gap-x-8 md:gap-y-12"
        >
          {photos.map((p, i) => {
            const spread = SPREADS[Math.min(Math.max(photos.length, 3), 6)];
            const [spanClass, aspectClass] = spread[i % spread.length];
            const oddLast =
              (photos.length - 1) % 2 === 1 && i === photos.length - 1;
            return (
              <li
                key={i}
                className={cn(
                  i === 0 || oddLast ? "col-span-2" : "col-span-1",
                  spanClass,
                )}
              >
                <figure>
                  <Img
                    value={p.image}
                    alt={p.caption || alt}
                    className={cn("ledger-frame w-full", aspectClass)}
                  />
                  <Fig n={i + 1}>{p.caption}</Fig>
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
