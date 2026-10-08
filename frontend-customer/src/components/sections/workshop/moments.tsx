import { cn } from "@/lib/utils";
import { has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Polaroid, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Pinboard gallery of polaroid moments held with washi tape strips and Caveat captions. */
export function MomentsGallery({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section tone="kraft" label={alt || "Moments"}>
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
            "grid grid-cols-2 gap-6 md:gap-8 lg:gap-10",
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
              <Polaroid
                image={p.image}
                alt={p.caption || alt}
                caption={p.caption}
                className={cn(
                  "aspect-[4/5] w-full transition-transform motion-safe:hover:scale-[1.02]",
                  i % 2 === 0 ? "lg:rotate-[-1.5deg]" : "lg:rotate-[1.5deg]",
                )}
                tapePosition={
                  i % 3 === 0
                    ? "top-left"
                    : i % 3 === 1
                      ? "top-center"
                      : "top-right"
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
