import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Caption, FRAME, Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Editorial drops that still fill the spread for every count. */
const ROW1: [place: string, aspect: string][] = [
  ["md:col-span-5", "aspect-[3/4]"],
  ["md:col-span-4 md:mt-24", "aspect-square"],
  ["md:col-span-3 md:mt-10", "aspect-[3/4]"],
];
const SPREADS: Record<number, [place: string, aspect: string][]> = {
  3: ROW1,
  4: [...ROW1, ["md:col-span-6 md:col-start-4", "aspect-[3/2]"]],
  5: [
    ...ROW1,
    ["md:col-span-4 md:col-start-3", "aspect-[3/4]"],
    ["md:col-span-4 md:mt-16", "aspect-[3/4]"],
  ],
  6: [
    ...ROW1,
    ["md:col-span-3 md:col-start-2", "aspect-[3/4]"],
    ["md:col-span-4 md:mt-16", "aspect-[3/4]"],
    ["md:col-span-4 md:-mt-8", "aspect-square"],
  ],
};

/** Editorial spread: framed plates of mixed proportions and drops. */
export function MomentsEditorial({ block, editable }: SectionProps) {
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
            className="mb-16"
          />
        )}

        <ul
          aria-label={alt || "Photos"}
          className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-12 md:items-start md:gap-x-10 md:gap-y-20"
        >
          {photos.map((p, i) => {
            const spread = SPREADS[Math.min(Math.max(photos.length, 3), 6)];
            const [place, aspect] = spread[i % spread.length];
            const oddLast = photos.length % 2 === 1 && i === photos.length - 1;
            return (
              <li
                key={i}
                className={cn(oddLast ? "col-span-2" : "col-span-1", place)}
              >
                <figure>
                  <div className={FRAME}>
                    <Img
                      value={p.image}
                      alt={p.caption || alt}
                      className={cn("w-full", aspect)}
                    />
                  </div>
                  {p.caption && <Caption>{p.caption}</Caption>}
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
