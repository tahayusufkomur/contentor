import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, MoonGlyph, Opener, ROMAN, Section, WRAP, str } from "./ui";

type Step = { title?: string; text?: string };

/** HowItWorks "ritual": 3-4 ritual phases along a ceremonial moon-phase axis. */
export function HowItWorksRitual({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const timeline = (
    <div className="relative mt-14 sm:mt-16">
      {/* Vertical celestial hairline connecting the moon phases */}
      <div
        aria-hidden="true"
        className="absolute bottom-8 left-5 top-8 w-px bg-[color-mix(in_oklch,var(--primary)_35%,transparent)] sm:left-6 md:left-1/2 md:-translate-x-1/2"
      />

      <ol className="space-y-12 md:space-y-16">
        {steps.map((step, i) => {
          const isEven = i % 2 === 0;
          return (
            <li
              key={i}
              className={cn(
                "relative flex items-start gap-6 md:gap-12",
                "md:grid md:grid-cols-2",
                isEven ? "md:text-right" : "md:flex-row-reverse md:text-left",
              )}
            >
              {/* Left / Primary Content Column */}
              <div
                className={cn(
                  "pl-14 md:pl-0",
                  isEven ? "md:col-start-1" : "md:col-start-2",
                )}
              >
                <span className="font-display text-[0.8rem] font-medium uppercase tracking-[0.2em] text-primary">
                  Phase {ROMAN[i % ROMAN.length]}
                </span>
                <h3
                  className={cn(
                    H3,
                    "mt-2 text-[1.25rem] leading-snug md:text-[1.4rem]",
                  )}
                >
                  {step.title}
                </h3>
                {step.text && (
                  <p
                    className={cn(
                      "mt-2.5 max-w-[42ch] text-pretty text-[0.98rem] leading-[1.7] text-muted-foreground",
                      isEven && "md:ml-auto",
                    )}
                  >
                    {step.text}
                  </p>
                )}
              </div>

              {/* Center Moon Node */}
              <div
                aria-hidden="true"
                className="absolute left-1.5 top-0 flex size-8 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--primary)_60%,transparent)] bg-background shadow-md sm:left-2 md:left-1/2 md:-translate-x-1/2"
              >
                <MoonGlyph phase={i} className="size-4 text-primary" />
              </div>

              {/* Empty placeholder for the other column on md screens */}
              <div
                aria-hidden="true"
                className={cn(
                  "hidden md:block",
                  isEven ? "md:col-start-2" : "md:col-start-1",
                )}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <Section tone="temple" label={alt || "Ritual sequence"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <figure className="relative mx-auto w-full max-w-sm overflow-hidden rounded-t-full border border-[color-mix(in_oklch,var(--primary)_50%,transparent)] p-1.5 shadow-2xl lg:col-span-4">
              <Img
                value={block.image}
                alt={alt}
                className="sanctum-arch aspect-[4/5] w-full"
              />
            </figure>
            <div className="lg:col-span-8">{timeline}</div>
          </div>
        ) : (
          timeline
        )}
      </div>
    </Section>
  );
}
