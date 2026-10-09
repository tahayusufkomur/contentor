import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { makeHowTimeline } from "../how-layouts";
import { BlobImage, H3, Opener, Section, WRAP, getSproutTint, str } from "./ui";

type Step = { title?: string; text?: string };

const ROTATIONS = ["-6deg", "6deg", "-4deg", "5deg"];

/** Step-by-step winding path through numbered round bubbles and chunky cards. */
export function HowItWorksSteps({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="paper" label={alt || "How it works"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} align="left" />

        <div
          className={cn(
            "mt-12 grid gap-8",
            showImage ? "lg:grid-cols-12 lg:items-start" : "grid-cols-1",
          )}
        >
          {/* Optional illustration/photo */}
          {showImage && (
            <div className="lg:col-span-4 lg:sticky lg:top-24">
              <BlobImage
                value={block.image}
                alt={alt}
                variant={2}
                offsetColor="primary"
              />
            </div>
          )}

          {/* Steps container */}
          <div
            className={cn(
              showImage ? "lg:col-span-8" : "w-full",
              "grid gap-6 sm:grid-cols-2",
              !showImage &&
                (steps.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"),
            )}
          >
            {steps.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "relative flex flex-col justify-between rounded-[2rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] p-7 transition-all duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-md",
                  getSproutTint(i),
                )}
              >
                <div>
                  {/* Round numbered bubble sticker */}
                  <div className="flex items-center justify-between">
                    <span
                      className="inline-flex size-12 items-center justify-center rounded-full bg-accent font-display text-[1.2rem] font-bold text-accent-foreground shadow-sm"
                      style={{
                        transform: `rotate(${ROTATIONS[i % ROTATIONS.length]})`,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[0.8rem] font-bold uppercase tracking-wider text-muted-foreground/80">
                      Step {i + 1}
                    </span>
                  </div>

                  <h3
                    className={cn(
                      H3,
                      "mt-5 text-[1.25rem] font-bold leading-snug text-foreground md:text-[1.35rem]",
                    )}
                  >
                    {s.title}
                  </h3>

                  {s.text && (
                    <p className="mt-2.5 text-[0.98rem] leading-[1.65] text-muted-foreground">
                      {s.text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/** A friendly trail: round yellow numbered bubbles down a dashed path. */
export const HowItWorksTrail = makeHowTimeline({
  Section,
  wrap: WRAP,
  Opener,
  h3: H3,
  text: "text-[1rem] leading-[1.7] text-muted-foreground",
  dot: "bg-accent font-display font-bold text-accent-foreground shadow-md",
  rail: "before:w-0 before:border-l-[3px] before:border-dashed before:border-primary/40",
  photo: "sprout-blob-1 overflow-hidden shadow-lg",
});
