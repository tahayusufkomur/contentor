import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Classroom photo moments taped in as alternating tilted prints. */
export function MomentsClassroom({ block, editable }: SectionProps) {
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
                    "primer-print aspect-[4/5] w-full",
                    i % 2 ? "rotate-[1.2deg]" : "rotate-[-1.2deg]",
                  )}
                />
                {p.caption && (
                  <figcaption className="primer-courier mt-4 text-center text-[0.85rem] text-muted-foreground">
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
