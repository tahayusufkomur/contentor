import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, H3, Halo, Opener, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as evening rituals: soft cards with index discs, with an optional
 *  arched photo. */
export function BenefitsRituals({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const cards = (gridClassName: string) => (
    <ul className={gridClassName}>
      {items.map((it, i) => (
        <li
          key={i}
          className="flex flex-col rounded-[var(--radius)] border border-border bg-muted p-7"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--primary)_15%,transparent)] text-[0.85rem] font-semibold text-primary nocturne-tnum"
          >
            {i + 1}
          </span>
          <h3 className={cn(H3, "mt-6 text-[1.3rem] leading-snug")}>
            {it.title}
          </h3>
          <p className="mt-2 text-[0.98rem] leading-[1.65] text-muted-foreground">
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
          <div className="mt-14 grid gap-y-12 md:mt-16 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-4">
              <Halo className="[--nocturne-halo:0.5]">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(
                    ARCH,
                    "aspect-[3/4] w-full max-w-sm mx-auto lg:sticky lg:top-24",
                  )}
                />
              </Halo>
            </div>
            <div className="lg:col-span-8">
              {cards("grid gap-5 sm:grid-cols-2")}
            </div>
          </div>
        ) : (
          cards(
            cn(
              "mt-14 grid gap-5 sm:grid-cols-2 md:mt-16",
              items.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3",
            ),
          )
        )}
      </div>
    </Section>
  );
}
