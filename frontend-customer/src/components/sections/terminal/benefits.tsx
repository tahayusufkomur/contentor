import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, Opener, Section, WindowChrome, WRAP, pad2, str } from "./ui";

type Item = { title?: string; text?: string };

/** Learning benefits and program capabilities formatted as CLI features and flags. */
export function BenefitsFeatures({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const featuresList = (
    <div className="grid gap-5 sm:grid-cols-2">
      {items.map((it, i) => (
        <div
          key={i}
          className="group relative flex flex-col justify-between rounded-[var(--radius)] border border-border bg-[color-mix(in_oklch,var(--background)_90%,var(--surface))] p-5 sm:p-6 transition-colors duration-200 hover:border-primary/60"
        >
          <div>
            <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span className="text-primary font-bold">--feat_{pad2(i)}</span>
              <span className="rounded bg-[color-mix(in_oklch,var(--primary)_15%,transparent)] px-2 py-0.5 font-bold text-primary">
                [OK]
              </span>
            </div>

            <h3
              className={cn(
                H3,
                "mt-3 text-[1.2rem] leading-snug md:text-[1.3rem]",
              )}
            >
              {it.title}
            </h3>

            {it.text && (
              <p className="mt-2.5 max-w-[48ch] text-[0.98rem] leading-[1.65] text-muted-foreground">
                {it.text}
              </p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 font-mono text-[0.75rem] text-muted-foreground">
            <span className="text-accent" aria-hidden="true">
              {"//"}
            </span>{" "}
            verified module
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Section tone="console" label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            <figure className="lg:col-span-4">
              <WindowChrome
                title="features.png"
                tag="SPECS"
                bodyClassName="p-0 overflow-hidden"
                className="lg:sticky lg:top-24"
              >
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
              </WindowChrome>
            </figure>
            <div className="lg:col-span-8">{featuresList}</div>
          </div>
        ) : (
          <div className="mt-14">{featuresList}</div>
        )}
      </div>
    </Section>
  );
}
