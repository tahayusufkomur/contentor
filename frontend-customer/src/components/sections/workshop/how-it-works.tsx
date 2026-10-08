import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  H2,
  H3,
  Kicker,
  Opener,
  Polaroid,
  Section,
  WRAP,
  pad2,
  str,
} from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step method styled as craft pattern pieces with handwritten step numbers. */
export function HowItWorksSteps({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="kraft" label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-12">
            <div className="lg:col-span-8">
              <Kicker block={block} editable={editable} />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(H2, "mt-2 block max-w-[20ch]")}
              />
              <Txt
                block={block}
                field="intro"
                editable={editable}
                as="p"
                placeholder="Intro"
                className="mt-5 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
              />
            </div>
            <div className="lg:col-span-4">
              <Polaroid
                image={block.image}
                alt={alt}
                className="mx-auto aspect-[4/5] w-full max-w-[14rem] lg:rotate-[1.5deg]"
                tapePosition="top-right"
              />
            </div>
          </div>
        ) : (
          <Opener block={block} editable={editable} />
        )}

        <ol
          className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-[repeat(var(--workshop-cols),minmax(0,1fr))]"
          style={
            {
              "--workshop-cols": Math.max(steps.length, 1),
            } as CSSProperties
          }
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className="workshop-seam relative flex flex-col rounded-[var(--radius)] border-2 border-dashed border-border bg-card p-6 sm:p-7 shadow-xs"
            >
              <div className="flex items-center justify-between gap-3 border-b border-dashed border-border pb-3">
                <span className="workshop-hand text-[1.35rem] font-bold leading-none text-accent">
                  Step {pad2(i)}
                </span>
                <span className="text-[0.78rem] font-bold uppercase tracking-wider text-muted-foreground">
                  Part {String.fromCharCode(65 + i)}
                </span>
              </div>

              <h3
                className={cn(
                  H3,
                  "mt-4 text-[1.25rem] leading-snug md:text-[1.35rem]",
                )}
              >
                <span className="sr-only">{`Step ${i + 1}: `}</span>
                {s.title}
              </h3>

              {s.text && (
                <p className="mt-2.5 text-pretty text-[0.98rem] leading-[1.65] text-muted-foreground">
                  {s.text}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
