import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, LABEL_ACCENT, Opener, Section, WRAP, pad2, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits as dance moves / drills: neon outline cards with move index cues,
 *  with an optional mirror wall photo panel. */
export function BenefitsMoves({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const cards = (gridClass: string) => (
    <ul className={gridClass}>
      {items.map((it, i) => (
        <li
          key={i}
          className="studiofloor-card flex flex-col justify-between rounded-[var(--radius)] p-7 md:p-8 transition-all duration-300"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className={LABEL_ACCENT}>MOVE {pad2(i)}</span>
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
              />
            </div>
            <h3 className={cn(H3, "mt-5 text-[1.3rem] leading-snug")}>
              {it.title}
            </h3>
            <p className="mt-3 text-[0.98rem] leading-[1.65] text-muted-foreground">
              {it.text}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} cue="MOVES" />

        {showImage ? (
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:col-span-4">
              <div className="relative overflow-hidden rounded-[var(--radius)] border border-primary/40 shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_20%,transparent)] lg:sticky lg:top-24">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
                <div
                  aria-hidden="true"
                  className="studiofloor-lightbar absolute inset-0 pointer-events-none"
                />
              </div>
            </div>
            <div className="lg:col-span-8">
              {cards("grid gap-5 sm:grid-cols-2")}
            </div>
          </div>
        ) : (
          <div className="mt-14">
            {cards(
              cn(
                "grid gap-6 sm:grid-cols-2",
                items.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3",
              ),
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
