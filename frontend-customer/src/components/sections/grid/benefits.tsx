import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, pad, row } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as an index: ruled rows — number, title, text — on a 9-col
 *  sub-grid that lines up with the page grid. */
export function BenefitsIndex({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const photo = imageUrl(block.image);
  return (
    <Sheet>
      <Head block={block} editable={editable} />
      <div className={cn(row, "mt-14 gap-y-10 md:mt-20")}>
        {photo && (
          <Img
            value={block.image}
            alt={String(block.heading ?? "")}
            className="swiss-photo col-span-6 aspect-[3/4] md:sticky md:top-24 md:col-span-3 md:self-start"
          />
        )}
        <ol className="col-span-12 border-b border-foreground md:col-span-9 md:col-start-4">
          {items.map((it, i) => (
            <li
              key={i}
              className="grid grid-cols-9 items-baseline gap-x-4 gap-y-2 border-t border-foreground py-6 md:gap-x-6 md:py-8"
            >
              <span className="swiss-mono col-span-9 text-muted-foreground md:col-span-1">
                ({pad(i + 1)})
              </span>
              <h3 className="swiss-h3 col-span-9 text-balance md:col-span-3">
                {it.title}
              </h3>
              <p className="col-span-9 max-w-[52ch] text-[1.0625rem] leading-[1.5] text-muted-foreground md:col-span-5">
                {it.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
