import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, Opener, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as a gear checklist: pine checkmarks, slab headings, and an optional field postcard. */
export function BenefitsGearList({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ul className="border-t-2 border-foreground">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid items-start gap-x-8 gap-y-2 border-b border-border py-6 sm:grid-cols-[3rem_minmax(0,5fr)_minmax(0,6fr)]"
        >
          <span
            aria-hidden="true"
            className="mt-1.5 flex size-5 items-center justify-center rounded-[2px] border-2 border-primary text-[0.7rem] font-bold text-primary"
          >
            ✓
          </span>
          <h3 className={cn(H3, "text-[1.25rem] md:text-[1.45rem]")}>
            {it.title}
          </h3>
          <p className="max-w-[46ch] text-pretty text-[0.98rem] leading-[1.6] text-muted-foreground">
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
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-4">
              <Img
                value={block.image}
                alt={alt}
                className="trail-postcard aspect-[3/4] w-full max-w-sm rotate-[-2deg] lg:sticky lg:top-24"
              />
            </div>
            <div className="lg:col-span-8">{list}</div>
          </div>
        ) : (
          <div className="mt-14">{list}</div>
        )}
      </div>
    </Section>
  );
}
