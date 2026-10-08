import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, StarDoodle, Sticker, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

const ROTATIONS = ["-2.5deg", "2.5deg", "-1.8deg", "3deg", "-2.8deg", "1.8deg"];

/** Candid photo snapshots scattered like sticker prints in a family album. */
export function MomentsSnapshots({ block, editable }: SectionProps) {
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
            field="caption"
            align="center"
            className="mb-14"
          />
        )}

        <ul
          className={cn(
            "grid grid-cols-1 gap-8 sm:grid-cols-2 lg:gap-10",
            photos.length >= 3 && "lg:grid-cols-3",
          )}
        >
          {photos.map((p, i) => {
            const rot = ROTATIONS[i % ROTATIONS.length];
            return (
              <li
                key={i}
                className={cn(
                  "relative transition-transform duration-300 motion-safe:hover:scale-[1.02] motion-safe:hover:rotate-0",
                  photos.length % 2 === 1 &&
                    i === photos.length - 1 &&
                    "sm:col-span-2 lg:col-span-1",
                )}
                style={{ transform: `rotate(${rot})` }}
              >
                <figure className="relative overflow-hidden rounded-[2.2rem] border-4 border-background bg-card p-3 shadow-md">
                  {/* Photo Frame */}
                  <div className="overflow-hidden rounded-[1.6rem]">
                    <Img
                      value={p.image}
                      alt={p.caption || alt}
                      className="aspect-[4/5] w-full"
                    />
                  </div>

                  {/* Caption & Playful sticker */}
                  {p.caption && (
                    <figcaption className="mt-3.5 px-2 pb-1 text-center font-display text-[0.98rem] font-semibold text-foreground">
                      {p.caption}
                    </figcaption>
                  )}

                  {/* Occasional corner star on first/last photo */}
                  {i === 0 && (
                    <div className="absolute -right-2 -top-2 hidden sm:block">
                      <Sticker rotate="12deg" className="size-8 p-0">
                        <StarDoodle className="size-4" />
                      </Sticker>
                    </div>
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
