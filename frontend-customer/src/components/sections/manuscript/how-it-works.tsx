import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  DoubleRule,
  Fleuron,
  H3,
  LABEL,
  MEASURE,
  Opener,
  Section,
  WRAP,
  str,
  toRoman,
} from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step method structured as sequential book chapters with abstracts. */
export function HowItWorksProcess({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const processList = (
    <div className="min-w-0">
      <DoubleRule className="mb-8 mt-0" />
      <ol className="space-y-10">
        {steps.map((s, i) => (
          <li key={i} className="relative">
            <p className={cn(LABEL, "text-accent")}>Chapter {toRoman(i + 1)}</p>
            <h3
              className={cn(
                H3,
                "mt-2 text-[1.35rem] font-normal leading-snug text-foreground md:text-[1.5rem]",
              )}
            >
              <span className="sr-only">{`Chapter ${i + 1}: `}</span>
              {s.title}
            </h3>
            {s.text && (
              <p className="mt-2 text-pretty text-[1.05rem] leading-[1.8] text-muted-foreground">
                {s.text}
              </p>
            )}
            {i < steps.length - 1 && (
              <div className="mt-8 flex justify-center opacity-40">
                <Fleuron className="text-xs" />
              </div>
            )}
          </li>
        ))}
      </ol>
      <DoubleRule className="mt-10" />
    </div>
  );

  return (
    <Section tone="paper" label={alt || "Process"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-12 grid gap-y-12 lg:grid-cols-12 lg:items-start lg:gap-x-12">
            <div className="lg:col-span-7">{processList}</div>

            <figure className="lg:sticky lg:top-24 lg:col-span-5">
              <div className="manuscript-plate">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>
            </figure>
          </div>
        ) : (
          <div className={cn(MEASURE, "mt-12")}>{processList}</div>
        )}
      </div>
    </Section>
  );
}
