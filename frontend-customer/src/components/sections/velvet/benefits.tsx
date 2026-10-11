import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { FRAME, H3, Halo, Opener, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as a numbered list: large italic numerals, a hairline between
 *  each line, an optional tall portrait beside it. */
export function BenefitsCandlelight({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ol className="border-b border-border">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-5 border-t border-border py-7 md:grid-cols-[5rem_minmax(0,1fr)] md:py-9"
        >
          <span
            aria-hidden="true"
            className="velvet-it velvet-tnum font-display text-[2.4rem] leading-none text-accent md:text-[3.4rem]"
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <h3
              className={cn(H3, "text-[1.4rem] leading-snug md:text-[1.7rem]")}
            >
              {it.title}
            </h3>
            <p className="mt-2 max-w-[52ch] text-[1rem] leading-[1.7] text-muted-foreground">
              {it.text}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        {showImage ? (
          <div className="mt-14 grid gap-y-14 md:mt-16 lg:grid-cols-12 lg:gap-x-14">
            <div className="lg:col-span-4">
              <Halo className="[--velvet-halo:0.5]">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(
                    FRAME,
                    "mx-auto aspect-[3/4] w-full max-w-sm lg:sticky lg:top-24",
                  )}
                />
              </Halo>
            </div>
            <div className="lg:col-span-8">{list}</div>
          </div>
        ) : (
          <div className="mx-auto mt-14 max-w-[56rem] md:mt-16">{list}</div>
        )}
      </div>
    </Section>
  );
}
