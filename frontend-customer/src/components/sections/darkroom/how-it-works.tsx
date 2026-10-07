import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import {
  Dot,
  H2,
  H3,
  Kicker,
  LABEL,
  Opener,
  Section,
  WRAP,
  pad2,
  str,
} from "./ui";

type Step = { title?: string; text?: string };

/** Steps laid out as a photographer's contact sheet with darkroom frame counters. */
export function HowItWorksContactSheet({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-10 border-t border-foreground pt-4 lg:grid-cols-12 lg:items-center lg:gap-x-10">
            <div className="lg:col-span-7">
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
                className="mt-6 block max-w-[44ch] text-pretty text-[1rem] leading-[1.6] text-muted-foreground"
              />
            </div>
            <figure className="lg:col-span-3 lg:col-start-10">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[4/5] w-full max-w-[14rem] lg:ml-auto"
              />
            </figure>
          </div>
        ) : (
          <Opener block={block} editable={editable} />
        )}

        <ol
          className="darkroom-strip -mx-4 mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:mt-20 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-[repeat(var(--darkroom-cols),minmax(0,1fr))]"
          style={
            { "--darkroom-cols": Math.max(steps.length, 1) } as CSSProperties
          }
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className="relative flex min-h-[14rem] w-[78%] shrink-0 snap-start flex-col border border-foreground p-5 sm:w-[46%] md:w-auto md:p-6"
            >
              <div
                className={cn(
                  LABEL,
                  "flex items-center justify-between text-muted-foreground",
                )}
              >
                <span aria-hidden="true" className="darkroom-tnum">
                  {pad2(i)} / {pad2(Math.max(steps.length - 1, 0))}
                </span>
                {i === 0 && <Dot />}
              </div>
              <h3
                className={cn(H3, "mt-auto pt-10 text-[1.2rem] leading-[1.2]")}
              >
                <span className="sr-only">{`${i + 1}. `}</span>
                {s.title}
              </h3>
              <p className="mt-2 text-pretty text-[0.92rem] leading-[1.6] text-muted-foreground">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
