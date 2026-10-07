import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { LABEL, Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Moments gallery as field postcards: tilted photo prints on a stone paper grid with mono captions. */
export function MomentsPostcards({ block, editable }: SectionProps) {
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
          aria-label={alt || "Photos"}
          className={cn(
            "grid grid-cols-2 gap-6 md:gap-10",
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
                <Img
                  value={p.image}
                  alt={p.caption || alt}
                  className={cn(
                    "trail-postcard aspect-[4/3] w-full",
                    i % 2 ? "rotate-[1.5deg]" : "rotate-[-1.5deg]",
                  )}
                />
                {p.caption && (
                  <figcaption
                    className={cn(
                      LABEL,
                      "mt-4 text-center text-muted-foreground",
                    )}
                  >
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
