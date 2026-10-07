import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  Check,
  H2,
  H3,
  Kicker,
  LABEL,
  Opener,
  Page,
  Section,
  WRAP,
  str,
} from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step process laid out as lettered classroom exercises on ruled paper. */
export function HowItWorksLessonPlan({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="ruled" label={alt}>
      <div className={WRAP}>
        <Page>
          {showImage ? (
            <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10">
              <div className="lg:col-span-8">
                <Kicker block={block} editable={editable} />
                <Txt
                  block={block}
                  field="heading"
                  editable={editable}
                  as="h2"
                  placeholder="Heading"
                  className={cn(H2, "mt-3 block max-w-[20ch]")}
                />
                <Txt
                  block={block}
                  field="intro"
                  editable={editable}
                  as="p"
                  placeholder="Intro"
                  className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
                />
              </div>
              <figure className="lg:col-span-3 lg:col-start-10">
                <Img
                  value={block.image}
                  alt={alt}
                  className="primer-print aspect-[4/5] w-full max-w-[14rem] rotate-[1.5deg] lg:ml-auto"
                />
              </figure>
            </div>
          ) : (
            <Opener block={block} editable={editable} />
          )}

          <ol
            className="mt-14 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-[repeat(var(--primer-cols),minmax(0,1fr))]"
            style={
              { "--primer-cols": Math.max(steps.length, 1) } as CSSProperties
            }
          >
            {steps.map((s, i) => (
              <li key={i}>
                <p className={cn(LABEL, "text-accent")} aria-hidden="true">
                  Exercise 1{String.fromCharCode(97 + i)}
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <Check className="mt-2" />
                  <h3 className={cn(H3, "text-[1.3rem] leading-snug")}>
                    <span className="sr-only">{`Step ${i + 1}: `}</span>
                    {s.title}
                  </h3>
                </div>
                {s.text && (
                  <p className="mt-2 max-w-[36ch] text-pretty text-[1rem] leading-[2rem] text-muted-foreground">
                    {s.text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Page>
      </div>
    </Section>
  );
}
