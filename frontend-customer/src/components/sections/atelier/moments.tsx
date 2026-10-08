import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, ArchFrame, Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

const ASPECTS = [
  "aspect-[3/4]",
  "aspect-[2/3] md:translate-y-8",
  "aspect-[3/4] md:-translate-y-4",
  "aspect-[4/5]",
  "aspect-[2/3] md:translate-y-6",
  "aspect-[3/4]",
];

/** Atelier lookbook: candid moments showcased in staggered arch frames of varied heights. */
export function MomentsLookbook({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section label={alt || "Lookbook"}>
      <div className={WRAP}>
        {(showHead || showCaption) && (
          <Opener
            block={block}
            editable={editable}
            field="caption"
            align="center"
            className="mb-16"
          />
        )}

        <ul
          aria-label={alt || "Moments lookbook"}
          className={cn(
            "grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10",
            photos.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2",
          )}
        >
          {photos.map((p, i) => {
            const aspectClass = ASPECTS[i % ASPECTS.length];
            return (
              <li
                key={i}
                className={cn(
                  "transition-transform duration-500",
                  photos.length % 2 === 1 &&
                    i === photos.length - 1 &&
                    photos.length < 3 &&
                    "sm:col-span-2 md:col-span-1",
                )}
              >
                <figure className="group">
                  <ArchFrame>
                    <Img
                      value={p.image}
                      alt={p.caption || alt}
                      className={cn(
                        ARCH,
                        "w-full atelier-zoom transition-transform duration-700",
                        aspectClass,
                      )}
                    />
                  </ArchFrame>
                  {p.caption && (
                    <figcaption className="mt-4 text-center font-display text-[0.95rem] italic text-muted-foreground">
                      {p.caption}
                    </figcaption>
                  )}
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
