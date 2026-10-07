import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, Opener, Plate, Section, WRAP, pad2, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as an exhibition catalogue: numbered hairline rows with title and gloss. */
export function BenefitsCatalogue({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ul className="border-b border-border">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid gap-x-8 gap-y-2 border-t border-border py-7 sm:grid-cols-[5rem_minmax(0,5fr)_minmax(0,6fr)]"
        >
          <Plate className="pt-1">No. {pad2(i)}</Plate>
          <h3
            className={cn(H3, "text-[1.3rem] leading-[1.2] md:text-[1.5rem]")}
          >
            {it.title}
          </h3>
          <p className="max-w-[46ch] text-pretty text-[0.95rem] leading-[1.65] text-muted-foreground sm:pt-0.5">
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
