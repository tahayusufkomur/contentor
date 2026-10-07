import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { BOX, Opener, Section, Track, WRAP, pad2, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Moments sleeves: candid photos presented as square record sleeves with halftone screen and track numbering. */
export function MomentsSleeves({ block, editable }: SectionProps) {
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
            className="mb-12"
          />
        )}

        <ul
          className={cn(
            "grid grid-cols-2 gap-4 md:gap-6",
            photos.length === 4 ? "md:grid-cols-2" : "md:grid-cols-3",
          )}
        >
          {photos.map((p, i) => (
            <li
              key={i}
              className={cn(
                photos.length % 2 === 1 &&
                  i === photos.length - 1 &&
                  "col-span-2 md:col-span-1",
              )}
            >
              <figure>
                <div className={cn(BOX, "encore-halftone group relative p-2")}>
                  <Img
                    value={p.image}
                    alt={p.caption || alt || `Photo ${i + 1}`}
                    className="encore-zoom aspect-square w-full"
                  />
                </div>
                <figcaption className="mt-3 flex items-baseline gap-3">
                  <Track>{pad2(i)}</Track>
                  {p.caption && (
                    <span className="text-[0.85rem] text-muted-foreground">
                      {p.caption}
                    </span>
                  )}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
