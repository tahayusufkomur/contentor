import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, ArchFrame, H3, Opener, Section, WRAP, pad2, str } from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step guidance formatted as a daily beauty & skincare routine thread. */
export function HowItWorksRoutine({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const stepThread = (
    <ol className="relative space-y-10 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-[color-mix(in_oklch,var(--border)_85%,transparent)] sm:before:left-5">
      {steps.map((s, i) => (
        <li key={i} className="relative flex items-start gap-6 pl-0 sm:gap-8">
          <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-accent bg-background text-accent shadow-sm sm:size-10">
            <span
              aria-hidden="true"
              className="font-display text-[0.95rem] italic sm:text-[1.05rem]"
            >
              {pad2(i)}
            </span>
          </div>
          <div className="min-w-0 pt-1">
            <h3
              className={cn(H3, "text-[1.3rem] leading-snug md:text-[1.45rem]")}
            >
              <span className="sr-only">{`Step ${i + 1}: `}</span>
              {s.title}
            </h3>
            {s.text && (
              <p className="mt-2 max-w-[48ch] text-[0.98rem] leading-[1.7] text-muted-foreground">
                {s.text}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <Section label={alt || "Routine"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid items-start gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <figure className="lg:col-span-5">
              <ArchFrame className="mx-auto max-w-xs lg:sticky lg:top-28 lg:max-w-none">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(ARCH, "aspect-[3/4] w-full")}
                />
              </ArchFrame>
            </figure>
            <div className="lg:col-span-7 lg:col-start-6">{stepThread}</div>
          </div>
        ) : (
          <div className="mx-auto mt-14 max-w-2xl">{stepThread}</div>
        )}
      </div>
    </Section>
  );
}
