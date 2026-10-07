import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Check, H3, LABEL, Opener, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Learning outcomes presented as an exercise checklist with ticked boxes. */
export function BenefitsOutcomes({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const checklist = (
    <>
      <p className={cn(LABEL, "text-accent")}>By the end you can</p>
      <ul className="mt-4 border-t border-border">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-4 border-b border-border py-5"
          >
            <Check done className="mt-1.5" />
            <div className="min-w-0">
              <h3
                className={cn(
                  H3,
                  "text-[1.25rem] leading-snug md:text-[1.4rem]",
                )}
              >
                {it.title}
              </h3>
              {it.text && (
                <p className="mt-1 max-w-[52ch] text-[1rem] leading-[1.65] text-muted-foreground">
                  {it.text}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        {showImage ? (
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            <figure className="lg:col-span-4">
              <Img
                value={block.image}
                alt={alt}
                className="primer-print aspect-[3/4] w-full max-w-sm rotate-[-1.5deg] lg:sticky lg:top-24"
              />
            </figure>
            <div className="lg:col-span-8">{checklist}</div>
          </div>
        ) : (
          <div className="mt-14">{checklist}</div>
        )}
      </div>
    </Section>
  );
}
