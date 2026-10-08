import { cn } from "@/lib/utils";
import { imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, Opener, Polaroid, Section, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

function StitchedCheck({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-primary bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-primary",
        className,
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3.5 fill-none stroke-current stroke-[2.2] [stroke-linecap:round] [stroke-linejoin:round]"
      >
        <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
      </svg>
    </span>
  );
}

/** Craftsmanship skills and takeaways with stitched tick marks and polaroid photo. */
export function BenefitsSkills({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const skillsList = (
    <ul className="grid gap-6 sm:grid-cols-2">
      {items.map((it, i) => (
        <li
          key={i}
          className="workshop-seam flex flex-col rounded-[var(--radius)] border border-border bg-card p-6"
        >
          <div className="flex items-start gap-3">
            <StitchedCheck className="mt-0.5" />
            <div className="min-w-0">
              <h3
                className={cn(
                  H3,
                  "text-[1.2rem] leading-snug md:text-[1.3rem]",
                )}
              >
                {it.title}
              </h3>
              {it.text && (
                <p className="mt-2 text-[0.98rem] leading-[1.65] text-muted-foreground">
                  {it.text}
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <Section tone="kraft" label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:items-start lg:gap-x-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-24">
                <Polaroid
                  image={block.image}
                  alt={alt}
                  className="mx-auto aspect-[3/4] w-full max-w-sm lg:rotate-[-1.5deg]"
                  tapePosition="top-center"
                />
              </div>
            </div>
            <div className="lg:col-span-8">{skillsList}</div>
          </div>
        ) : (
          <div className="mt-14">{skillsList}</div>
        )}
      </div>
    </Section>
  );
}
