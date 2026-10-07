import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** The market stall: a patchwork photo grid led by a double-sized hero shot. */
export function MomentsMarket({ block, editable }: SectionProps) {
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
            className="mb-14"
          />
        )}

        <ul
          className={cn(
            "grid grid-cols-2 gap-4 md:gap-6",
            photos.length === 4
              ? "md:grid-cols-2"
              : photos.length < 5
                ? "md:grid-cols-3"
                : "md:grid-cols-4",
          )}
        >
          {photos.map((p, i) => (
            <li
              key={i}
              className={cn(
                photos.length >= 5 && i === 0 && "md:col-span-2 md:row-span-2",
                photos.length >= 5 &&
                  i === photos.length - 1 &&
                  (photos.length - 1) % 2 === 1 &&
                  "md:col-span-4",
                photos.length % 2 === 1 &&
                  i === photos.length - 1 &&
                  "col-span-2 md:col-span-1",
              )}
            >
              <figure className="flex h-full flex-col">
                <Img
                  value={p.image}
                  alt={p.caption || alt}
                  className={cn(
                    "aspect-square w-full rounded-[var(--radius)] border-2 border-foreground",
                    photos.length >= 5 &&
                      i === photos.length - 1 &&
                      (photos.length - 1) % 2 === 1 &&
                      "md:aspect-[3/1]",
                  )}
                />
                {p.caption && (
                  <figcaption className="mt-3 text-[0.85rem] font-bold text-primary">
                    {p.caption}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
