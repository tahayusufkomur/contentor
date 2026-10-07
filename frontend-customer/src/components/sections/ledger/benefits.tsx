import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Fig, H3, Opener, Ref, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as numbered clauses: running head, hairline rows with mono clause
 *  numbers, and an optional sticky framed portrait beside them. */
export function BenefitsClauses({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ul className="border-b border-border">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid gap-x-8 gap-y-2 border-t border-border py-7 sm:grid-cols-[4rem_minmax(0,5fr)_minmax(0,6fr)] sm:gap-x-10 md:py-8"
        >
          <Ref className="pt-1">1.{i + 1}</Ref>
          <h3
            className={cn(H3, "text-[1.4rem] leading-[1.15] md:text-[1.6rem]")}
          >
            {it.title}
          </h3>
          <p className="max-w-[48ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground sm:pt-1">
            {it.text}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid gap-y-12 md:mt-20 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-4">
              <Img
                value={block.image}
                alt={alt}
                className="ledger-frame aspect-[3/4] w-full max-w-md"
              />
              <Fig className="max-w-md" />
            </div>
            <div className="lg:col-span-8">{list}</div>
          </div>
        ) : (
          <div className="mt-14 md:mt-20">{list}</div>
        )}
      </div>
    </Section>
  );
}
