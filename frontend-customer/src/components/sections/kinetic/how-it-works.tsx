import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { DISPLAY, H2, Kicker, LABEL, WRAP, pad2 } from "./ui";

type Step = { title?: string; text?: string };

/** A 4px track with square nodes; each step hangs off it. */
export function HowItWorksTrack({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const withImage = Boolean(imageUrl(block.image));
  const cols =
    steps.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";

  return (
    <section className="kinetic-iron py-20 md:py-32">
      <div className={WRAP}>
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-8">
          {withImage && (
            <div className="relative lg:col-span-4">
              <Img
                value={block.image}
                alt={typeof block.heading === "string" ? block.heading : ""}
                className="kinetic-notch aspect-[4/5] w-full [--kinetic-notch:44px] max-sm:aspect-square"
                imgClassName="grayscale contrast-[1.15] object-[50%_25%]"
              />
            </div>
          )}
          <div
            className={
              withImage ? "lg:col-span-7 lg:col-start-6" : "lg:col-span-10"
            }
          >
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(DISPLAY, H2, "mt-5 max-w-[15ch]")}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="mt-7 max-w-[52ch] text-lg leading-[1.55] text-muted-foreground"
            />
          </div>
        </div>

        {steps.length > 0 && (
          <ol className={cn("mt-16 grid gap-y-12 md:mt-24", cols)}>
            {steps.map((s, i) => (
              <li
                key={i}
                className="relative border-t-4 border-foreground pr-6 pt-10 md:pr-10"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -top-[14px] left-0 size-6",
                    i === steps.length - 1 ? "bg-primary" : "bg-foreground",
                  )}
                />
                <p className={cn(LABEL, "text-primary")}>Step {pad2(i)}</p>
                <h3
                  className={cn(
                    DISPLAY,
                    "mt-4 text-[clamp(2rem,1.4rem+1.4vw,2.9rem)]",
                  )}
                >
                  {s.title}
                </h3>
                <p className="mt-4 max-w-[36ch] leading-[1.6] text-muted-foreground">
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
