import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, StarGlyph, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Moments "visions": Sacred glimpses framed in staggered celestial arch and oval windows. */
export function MomentsVisions({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section tone="temple" label={alt || "Celestial visions"}>
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
          className={cn(
            "grid grid-cols-2 gap-6 md:gap-8",
            photos.length === 4
              ? "md:grid-cols-2 lg:grid-cols-4"
              : "md:grid-cols-3",
          )}
        >
          {photos.map((p, i) => {
            const isOval = i % 2 === 1;
            const isStaggered = i % 3 === 1;

            return (
              <li
                key={i}
                className={cn(
                  "flex flex-col items-center",
                  isStaggered && "md:translate-y-8",
                  photos.length % 2 === 1 &&
                    i === photos.length - 1 &&
                    "col-span-2 md:col-span-1",
                )}
              >
                <figure className="w-full">
                  <div
                    className={cn(
                      "relative overflow-hidden border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] bg-[color-mix(in_oklch,var(--primary)_8%,transparent)] p-1 shadow-lg transition-transform duration-500 motion-safe:hover:scale-[1.02]",
                      isOval
                        ? "sanctum-oval aspect-[4/5]"
                        : "sanctum-arch aspect-[4/5]",
                    )}
                  >
                    <Img
                      value={p.image}
                      alt={p.caption || alt}
                      className={cn(
                        "size-full",
                        isOval ? "sanctum-oval" : "sanctum-arch",
                      )}
                    />
                  </div>
                  {p.caption && (
                    <figcaption className="mt-4 flex items-center justify-center gap-1.5 text-center text-[0.82rem] uppercase tracking-[0.14em] text-muted-foreground">
                      <StarGlyph className="size-2 text-primary" />
                      <span>{p.caption}</span>
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
