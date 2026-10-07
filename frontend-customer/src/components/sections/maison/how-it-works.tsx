import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { FRAME, H3, Opener, Section, WRAP, roman, str } from "./ui";

type Step = { title?: string; text?: string };

/** Fittings: steps set as ruled rows with roman numerals and wide measures. */
export function HowItWorksFittings({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-12 lg:grid-cols-12 lg:items-center lg:gap-x-12">
            <div className="lg:col-span-8">
              <Opener block={block} editable={editable} align="left" />
            </div>
            <div className="lg:col-span-3 lg:col-start-10">
              <div className={cn(FRAME, "max-w-[13rem] lg:ml-auto")}>
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
              </div>
            </div>
          </div>
        ) : (
          <Opener block={block} editable={editable} align="center" />
        )}

        <ol className="mt-16 border-t border-foreground">
          {steps.map((s, i) => (
            <li
              key={i}
              className="grid items-baseline gap-y-3 border-b border-border py-9 md:grid-cols-12 md:gap-x-12"
            >
              <span
                aria-hidden="true"
                className="maison-opsz font-display text-[2rem] leading-none text-accent md:col-span-2"
              >
                {roman(i)}
              </span>
              <h3
                className={cn(
                  H3,
                  "text-[1.4rem] leading-tight md:col-span-4 md:text-[1.6rem]",
                )}
              >
                <span className="sr-only">{`Step ${i + 1}: `}</span>
                {s.title}
              </h3>
              <p className="max-w-[44ch] font-light text-[1rem] leading-[1.75] text-muted-foreground md:col-span-6">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
