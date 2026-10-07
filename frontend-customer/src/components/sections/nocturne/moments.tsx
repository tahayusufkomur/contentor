import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, Halo, Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Candid moments framed as arched lanterns under a warm glow. */
export function MomentsLanterns({ block, editable }: SectionProps) {
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
          aria-label={alt || "Photos"}
          className={cn(
            "grid grid-cols-2 gap-5 md:gap-8",
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
                <Halo className="[--nocturne-halo:0.45]">
                  <Img
                    value={p.image}
                    alt={p.caption || alt}
                    className={cn(ARCH, "aspect-[4/5] w-full")}
                  />
                </Halo>
                {p.caption && (
                  <figcaption className="mt-3 text-center text-[0.9rem] text-muted-foreground">
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
