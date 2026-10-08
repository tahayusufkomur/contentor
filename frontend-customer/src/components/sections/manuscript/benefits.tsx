import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  DoubleRule,
  H3,
  LABEL,
  Opener,
  Section,
  WRAP,
  str,
  toRoman,
} from "./ui";

type Item = { title?: string; text?: string };

/** Benefits formatted as book chapter openings with Roman numerals and hairlines. */
export function BenefitsChapters({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const chaptersGrid = (
    <ul
      className={cn(
        "grid gap-8 sm:grid-cols-2",
        items.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3",
      )}
    >
      {items.map((it, i) => (
        <li
          key={i}
          className="manuscript-chapter flex flex-col border-t border-border pt-5"
        >
          <p className={cn(LABEL, "text-accent")}>Chapter {toRoman(i + 1)}</p>
          <h3
            className={cn(
              H3,
              "mt-3 text-[1.3rem] leading-snug text-foreground md:text-[1.45rem]",
            )}
          >
            {it.title}
          </h3>
          {it.text && (
            <p className="mt-3 text-pretty text-[1rem] leading-[1.75] text-muted-foreground">
              {it.text}
            </p>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <Section tone="surface" label={alt || "Chapters"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        <DoubleRule className="my-12" />

        {showImage ? (
          <div className="grid gap-y-12 lg:grid-cols-12 lg:items-start lg:gap-x-12">
            <figure className="lg:col-span-4">
              <div className="manuscript-plate">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
              </div>
            </figure>

            <div className="lg:col-span-8">{chaptersGrid}</div>
          </div>
        ) : (
          chaptersGrid
        )}
      </div>
    </Section>
  );
}
