import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Candid studio moments arranged as a dance rehearsal film-strip and mirror
 *  wall photo strip with neon frame edges and captions. */
export function MomentsReel({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section tone="surface" label={alt || "Moments"}>
      <div className={WRAP}>
        {(showHead || showCaption) && (
          <Opener
            block={block}
            editable={editable}
            cue="REEL"
            field="caption"
            className="mb-14"
          />
        )}

        <ul
          aria-label={alt || "Moments reel"}
          className={cn(
            "grid grid-cols-2 gap-5 md:gap-7",
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
              <figure className="group flex flex-col">
                <div className="relative overflow-hidden rounded-[var(--radius)] border border-primary/30 shadow-[0_0_18px_color-mix(in_oklch,var(--primary)_15%,transparent)] transition-all duration-300 group-hover:border-primary/80 group-hover:shadow-[0_0_28px_color-mix(in_oklch,var(--primary)_30%,transparent)]">
                  <Img
                    value={p.image}
                    alt={p.caption || alt}
                    className="aspect-[4/5] w-full"
                  />
                  <div
                    aria-hidden="true"
                    className="studiofloor-lightbar absolute inset-0 pointer-events-none opacity-80 transition-opacity group-hover:opacity-100"
                  />
                </div>
                {p.caption && (
                  <figcaption className="mt-3 text-center studiofloor-display text-[0.8rem] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-accent">
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
