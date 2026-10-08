import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  ARCH,
  ArchFrame,
  Diamond,
  H3,
  Opener,
  Section,
  WRAP,
  pad2,
  str,
} from "./ui";

type Item = { title?: string; text?: string };

/** Benefits formatted as beauty and wellness rituals with champagne hairline dividers. */
export function BenefitsRituals({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const ritualList = (
    <ul className="divide-y divide-[color-mix(in_oklch,var(--border)_80%,transparent)] border-y border-[color-mix(in_oklch,var(--border)_80%,transparent)]">
      {items.map((it, i) => (
        <li
          key={i}
          className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-4 py-7 sm:grid-cols-[3.5rem_minmax(0,1fr)]"
        >
          <span
            aria-hidden="true"
            className="font-display text-[1.25rem] italic text-accent"
          >
            {pad2(i)}
          </span>
          <div className="min-w-0">
            <h3
              className={cn(
                H3,
                "text-[1.35rem] leading-snug md:text-[1.45rem]",
              )}
            >
              {it.title}
            </h3>
            {it.text && (
              <p className="mt-2 max-w-[50ch] text-[0.98rem] leading-[1.7] text-muted-foreground">
                {it.text}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <Section label={alt || "Rituals"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid items-start gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <figure className="lg:col-span-4">
              <ArchFrame className="mx-auto max-w-xs lg:sticky lg:top-28 lg:max-w-none">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(ARCH, "aspect-[3/4] w-full")}
                />
              </ArchFrame>
            </figure>
            <div className="lg:col-span-7 lg:col-start-6">{ritualList}</div>
          </div>
        ) : (
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <div
                key={i}
                className="relative rounded-2xl border border-[color-mix(in_oklch,var(--border)_80%,transparent)] bg-card p-7 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden="true"
                    className="font-display text-[1.35rem] italic text-accent"
                  >
                    {pad2(i)}
                  </span>
                  <Diamond />
                </div>
                <h3
                  className={cn(
                    H3,
                    "mt-4 text-[1.3rem] leading-snug md:text-[1.4rem]",
                  )}
                >
                  {it.title}
                </h3>
                {it.text && (
                  <p className="mt-2.5 text-[0.95rem] leading-[1.65] text-muted-foreground">
                    {it.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
