import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { FRAME, H3, Opener, Section, WRAP, roman, str } from "./ui";

type Item = { title?: string; text?: string };

/** The edit: numbered benefit plates in Bodoni roman numerals with light Jost descriptions. */
export function BenefitsEdit({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ol
      className={cn(
        "grid gap-x-12 gap-y-14 md:grid-cols-2",
        showImage ? "lg:col-span-8" : "mt-16 lg:grid-cols-3",
      )}
    >
      {items.map((it, i) => (
        <li key={i} className="border-t border-foreground pt-6">
          <span
            aria-hidden="true"
            className="maison-opsz font-display text-[2.6rem] leading-none text-accent"
          >
            {roman(i)}
          </span>
          <h3
            className={cn(
              H3,
              "mt-5 text-[1.35rem] leading-snug md:text-[1.5rem]",
            )}
          >
            {it.title}
          </h3>
          <p className="mt-3 max-w-[36ch] font-light text-[0.98rem] leading-[1.75] text-muted-foreground">
            {it.text}
          </p>
        </li>
      ))}
    </ol>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        {showImage ? (
          <div className="mt-16 grid gap-y-14 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:col-span-4">
              <div className={cn(FRAME, "w-full max-w-sm lg:sticky lg:top-24")}>
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
              </div>
            </div>
            {list}
          </div>
        ) : (
          list
        )}
      </div>
    </Section>
  );
}
