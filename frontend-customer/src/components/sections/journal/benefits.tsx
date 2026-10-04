import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, H3, Kicker, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as a contents page: hairline rows, a serif title on the left and
 *  its one-line gloss on the right. No icons, no cards. */
export function BenefitsContents({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ul className="border-b border-border">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid gap-x-10 gap-y-2 border-t border-border py-7 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:py-8"
        >
          <h3 className={cn(H3, "text-[1.5rem] leading-[1.15] md:text-[1.7rem]")}>{it.title}</h3>
          <p className="max-w-[48ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground sm:pt-1.5">
            {it.text}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <div className="grid gap-y-8 lg:grid-cols-12 lg:gap-x-10">
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
            field="intro"
            editable={editable}
            as="p"
            placeholder="Intro"
            className="block max-w-[44ch] self-end text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground lg:col-span-4 lg:col-start-9"
          />
        </div>

        {showImage ? (
          <div className="mt-14 grid gap-y-12 md:mt-20 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-4">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[3/4] w-full max-w-md lg:sticky lg:top-24"
              />
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
