import { cn } from "@/lib/utils";
import { Img, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { DoubleRule, Opener, Section, WRAP, str, toRoman } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Gallery of book plates: framed engravings and photographic figures
 *  with Roman numeral captions in literary italics. */
export function MomentsPlates({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead =
    has(block, "heading", editable) ||
    has(block, "kicker", editable) ||
    has(block, "caption", editable);

  return (
    <Section tone="paper" label={alt || "Gallery of Plates"}>
      <div className={WRAP}>
        {showHead && (
          <Opener
            block={block}
            editable={editable}
            field="caption"
            className="mb-12"
          />
        )}

        <DoubleRule className="mb-12" />

        <ul
          className={cn(
            "grid gap-8 sm:grid-cols-2",
            photos.length === 4
              ? "mx-auto max-w-4xl lg:grid-cols-2"
              : "lg:grid-cols-3",
          )}
        >
          {photos.map((p, i) => (
            <li
              key={i}
              className={cn(
                photos.length % 2 === 1 &&
                  i === photos.length - 1 &&
                  "sm:col-span-2 lg:col-span-1",
              )}
            >
              <figure className="flex h-full flex-col">
                <div className="manuscript-plate flex-1">
                  <Img
                    value={p.image}
                    alt={p.caption || alt || `Plate ${toRoman(i + 1)}`}
                    className="aspect-[4/5] w-full"
                  />
                </div>
                <figcaption className="mt-3 text-center">
                  <span className="manuscript-small-caps mr-1.5 text-xs font-semibold text-accent">
                    Plate {toRoman(i + 1)}.
                  </span>
                  {p.caption && (
                    <span className="font-display italic text-[0.92rem] text-muted-foreground">
                      {p.caption}
                    </span>
                  )}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>

        <DoubleRule className="mt-12" />
      </div>
    </Section>
  );
}
