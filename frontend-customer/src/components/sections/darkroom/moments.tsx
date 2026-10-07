import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Plate, Section, WRAP, pad2, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** A rhythmically spaced gallery wall of uncropped prints and plate labels. */
export function MomentsGrid({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHeader =
    has(block, "heading", editable) ||
    has(block, "kicker", editable) ||
    has(block, "caption", editable);

  return (
    <Section label={alt || "Moments"}>
      <div className={WRAP}>
        {showHeader && (
          <div className="mb-14 md:mb-20">
            <Opener block={block} editable={editable} field="caption" />
          </div>
        )}

        <div
          className={cn(
            "grid grid-cols-2 gap-x-5 gap-y-12 md:gap-x-8 md:gap-y-16",
            photos.length === 4 ? "md:grid-cols-2" : "md:grid-cols-3",
          )}
        >
          {photos.map((p, i) => {
            const last = i === photos.length - 1;
            // Phones: an odd last plate takes the full row.
            const wide = last && photos.length % 2 === 1;
            return (
              <figure
                key={i}
                className={cn(wide && "col-span-2 md:col-span-1")}
              >
                <Img
                  value={p.image}
                  alt={p.caption || alt}
                  className={cn(
                    "w-full",
                    wide ? "aspect-[3/2] md:aspect-[4/5]" : "aspect-[4/5]",
                  )}
                />
                <figcaption className="mt-3 flex items-baseline gap-3">
                  <Plate>{pad2(i)}</Plate>
                  {p.caption && (
                    <span className="text-[0.85rem] leading-snug text-muted-foreground">
                      {p.caption}
                    </span>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
