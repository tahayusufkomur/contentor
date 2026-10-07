import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, H3, Halo, LABEL, Opener, Section, WRAP, str } from "./ui";

type Step = { title?: string; text?: string };

/** How it works as an evening wind-down timeline, with an optional arched
 *  photo. */
export function HowItWorksWindDown({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        <div className="mt-14 grid gap-y-12 md:mt-16 lg:grid-cols-12 lg:gap-x-10">
          <div
            className={
              showImage ? "lg:col-span-7" : "lg:col-span-8 lg:col-start-3"
            }
          >
            <ol>
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-5 pb-10 last:pb-0"
                >
                  <div className="relative">
                    {i < steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-[0.75rem] top-6 w-px bg-border"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className="flex size-6 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--primary)_20%,transparent)] ring-4 ring-background"
                    >
                      <span className="size-2 rounded-full bg-primary" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p aria-hidden="true" className={LABEL}>
                      Step {i + 1}
                    </p>
                    <h3 className={cn(H3, "mt-2 text-[1.35rem] leading-snug")}>
                      <span className="sr-only">{`Step ${i + 1}: `}</span>
                      {s.title}
                    </h3>
                    <p className="mt-2 max-w-[40ch] text-[0.98rem] leading-[1.65] text-muted-foreground">
                      {s.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {showImage && (
            <div className="lg:col-span-4 lg:col-start-9">
              <Halo className="[--nocturne-halo:0.5]">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(
                    ARCH,
                    "aspect-[4/5] w-full max-w-[14rem] mx-auto lg:ml-auto lg:sticky lg:top-24",
                  )}
                />
              </Halo>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
