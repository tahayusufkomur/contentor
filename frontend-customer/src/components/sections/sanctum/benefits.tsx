import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { GoldFrame, H3, Opener, Section, SigilIcon, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits "gifts": Sacred gifts of the practice, each blessed with a unique mystical sigil. */
export function BenefitsGifts({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const grid = (
    <div
      className={cn(
        "grid gap-6 sm:grid-cols-2",
        items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-3",
      )}
    >
      {items.map((it, i) => (
        <GoldFrame
          key={i}
          className="flex flex-col items-center text-center transition-all duration-300 motion-safe:hover:-translate-y-1"
        >
          <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]">
            <SigilIcon index={i} className="size-7" />
          </div>
          <h3
            className={cn(H3, "text-[1.15rem] leading-snug md:text-[1.25rem]")}
          >
            {it.title}
          </h3>
          {it.text && (
            <p className="mt-3 text-pretty text-[0.98rem] leading-[1.65] text-muted-foreground">
              {it.text}
            </p>
          )}
        </GoldFrame>
      ))}
    </div>
  );

  return (
    <Section tone="temple" label={alt || "Sacred gifts"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} className="mb-16" />

        {showImage ? (
          <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <figure className="relative mx-auto w-full max-w-sm overflow-hidden rounded-t-full border border-[color-mix(in_oklch,var(--primary)_50%,transparent)] p-1.5 shadow-2xl lg:col-span-4">
              <Img
                value={block.image}
                alt={alt}
                className="sanctum-arch aspect-[3/4] w-full"
              />
            </figure>
            <div className="lg:col-span-8">{grid}</div>
          </div>
        ) : (
          grid
        )}
      </div>
    </Section>
  );
}
