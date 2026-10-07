import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { CARD, H3, LABEL, Opener, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits laid out as a trattoria ingredient card with checkmarks and dotted dividers. */
export function BenefitsIngredients({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const card = (
    <div
      className={cn(
        CARD,
        "p-7 md:p-9",
        showImage ? "max-w-none" : "mt-14 max-w-[52rem]",
      )}
    >
      <p className={LABEL}>What&rsquo;s in it</p>
      <ul className="mt-4">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-4 border-b-2 border-dotted border-border py-4 last:border-0"
          >
            <span aria-hidden="true" className="mt-1 font-bold text-accent">
              ✓
            </span>
            <div className="min-w-0">
              <h3
                className={cn(
                  H3,
                  "text-[1.25rem] leading-snug md:text-[1.4rem]",
                )}
              >
                {it.title}
              </h3>
              <p className="mt-1 text-[0.98rem] leading-[1.6] text-muted-foreground">
                {it.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
                className="tavola-photo aspect-[3/4] w-full max-w-sm rounded-[var(--radius)] lg:sticky lg:top-24"
              />
            </div>
            <div className="lg:col-span-8">{card}</div>
          </div>
        ) : (
          card
        )}
      </div>
    </Section>
  );
}
