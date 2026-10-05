import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { FILL, Kicker, PopSection, WRAP, str } from "./ui";

type Step = { title?: string; text?: string };

const DOT: (keyof typeof FILL)[] = ["berry", "lime", "lilac", "pink"];

/** Big numbered circles joined by a squiggle (the steps are a sequence). */
export function HowItWorksCircles({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const withImage = Boolean(imageUrl(block.image));
  const four = steps.length >= 4;
  return (
    <PopSection bg="var(--background)" className="py-20 md:py-28">
      <div className={WRAP}>
        <div
          className={cn(
            "grid items-center gap-x-16 gap-y-12",
            withImage && "md:grid-cols-12",
          )}
        >
          <div
            className={cn(
              withImage ? "md:col-span-7 lg:col-span-8" : "max-w-4xl",
            )}
          >
            <Kicker block={block} editable={editable} fill="lilac" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className="pop-display pop-h2 mt-6"
              placeholder="Heading"
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="pop-lede mt-6 max-w-[36rem] text-muted-foreground"
            />
          </div>
          {withImage && (
            <div className="relative mx-auto w-full max-w-[17rem] md:col-span-5 md:mr-4 lg:col-span-4">
              <div className="pop-card rotate-3 overflow-hidden">
                <Img
                  value={block.image}
                  alt={str(block.heading)}
                  className="aspect-[4/5] w-full"
                />
              </div>
            </div>
          )}
        </div>

        <ol
          className={cn(
            "mt-16 grid gap-x-8 gap-y-10 md:mt-20",
            four
              ? "sm:grid-cols-2 sm:gap-y-14 lg:grid-cols-4"
              : "md:grid-cols-3",
          )}
        >
          {steps.map((s, i) => (
            <li key={i} className="relative flex gap-5 md:block">
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "pop-squiggle absolute left-[7.5rem] right-[-2rem] top-[calc(3.75rem-9px)] hidden",
                    four ? "lg:block" : "md:block",
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "pop-card pop-display relative flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center !rounded-full text-[2.75rem] md:h-[7.5rem] md:w-[7.5rem] md:text-[3.75rem]",
                  FILL[DOT[i % DOT.length]],
                )}
              >
                {i + 1}
              </span>
              <div className="pt-2 md:mt-7 md:pt-0">
                <h3 className="pop-h3 text-[1.5rem] md:text-[1.625rem]">
                  {s.title}
                </h3>
                <p className="mt-2.5 max-w-[22rem] text-base leading-relaxed text-muted-foreground">
                  {s.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </PopSection>
  );
}
