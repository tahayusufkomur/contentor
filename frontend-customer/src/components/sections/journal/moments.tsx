import { cn } from "@/lib/utils";
import { Img, Txt, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Desktop spread: prints of mixed size and drop, like a contact page laid
 *  out by hand. On phones the same prints become a swipeable strip. */
const SPREAD: [place: string, aspect: string][] = [
  ["md:col-span-5", "md:aspect-[4/5]"],
  ["md:col-span-4 md:mt-28", "md:aspect-square"],
  ["md:col-span-3 md:mt-12", "md:aspect-[3/4]"],
  ["md:col-span-3 md:col-start-2", "md:aspect-[3/4]"],
  ["md:col-span-4 md:mt-20", "md:aspect-[4/5]"],
  ["md:col-span-4 md:-mt-10", "md:aspect-square"],
];

export function MomentsSpread({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const alt = str(block.heading) || str(block.caption);
  const showHead = has(block, "heading", editable) || has(block, "kicker", editable);
  const showCaption = has(block, "caption", editable);

  return (
    <Section label={alt || "Moments"}>
      <div className={WRAP}>
        {(showHead || showCaption) && (
          <div className="mb-12 grid gap-y-6 md:mb-16 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-7">
              <Kicker block={block} editable={editable} />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(H2, "mt-5 block max-w-[18ch]")}
              />
            </div>
            <Txt
              block={block}
              field="caption"
              editable={editable}
              as="p"
              placeholder="Caption"
              className="block max-w-[40ch] self-end text-pretty font-display text-[1.2rem] italic leading-[1.5] text-muted-foreground lg:col-span-4 lg:col-start-9"
            />
          </div>
        )}

        <ul
          tabIndex={0}
          aria-label={alt || "Photos"}
          className="journal-strip -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-12 md:items-start md:gap-x-8 md:gap-y-16 md:overflow-visible md:px-0 lg:gap-x-10"
        >
          {photos.map((p, i) => (
            <li
              key={i}
              className={cn("w-[74%] shrink-0 snap-start sm:w-[46%] md:w-auto", SPREAD[i % SPREAD.length][0])}
            >
              <figure>
                <Img
                  value={p.image}
                  alt={p.caption || alt}
                  className={cn("aspect-[4/5] w-full", SPREAD[i % SPREAD.length][1])}
                />
                {p.caption && (
                  <figcaption className="mt-3 font-display text-[0.98rem] italic leading-snug text-muted-foreground">
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
