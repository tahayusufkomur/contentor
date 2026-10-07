import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Fig, H2, H3, Ref, RULE, RunningHead, Section, WRAP, str } from "./ui";

type Step = { title?: string; text?: string };

/** Steps formatted as quarters: running head, tick marks with mono Q-labels
 *  and vertical hairlines, and ruled columns. */
export function HowItWorksQuarters({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <RunningHead block={block} editable={editable} />

        <div className="mt-10 grid gap-y-10 md:mt-12 lg:grid-cols-12 lg:items-center lg:gap-x-10">
          <div className={showImage ? "lg:col-span-7" : "lg:col-span-8"}>
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "block max-w-[18ch]")}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-7 block max-w-[44ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
            />
          </div>
          {showImage && (
            <div className="lg:col-span-3 lg:col-start-10">
              <Img
                value={block.image}
                alt={alt}
                className="ledger-frame aspect-[4/5] w-full max-w-[14rem] lg:ml-auto"
              />
              <Fig className="max-w-[14rem] lg:ml-auto" />
            </div>
          )}
        </div>

        <ol
          className={cn(
            RULE,
            "mt-16 grid md:mt-24 md:grid-cols-2 lg:grid-cols-[repeat(var(--ledger-cols),minmax(0,1fr))]",
          )}
          style={
            { "--ledger-cols": Math.max(steps.length, 1) } as CSSProperties
          }
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className="border-b border-border py-10 md:max-lg:odd:pr-8 md:max-lg:even:border-l md:max-lg:even:pl-8 lg:border-b-0 lg:border-l lg:px-8 lg:pb-4 lg:first:border-l-0 lg:first:pl-0"
            >
              <div className="flex items-center gap-3">
                <Ref>Q{i + 1}</Ref>
                <span aria-hidden="true" className="h-6 w-px bg-foreground" />
              </div>
              <h3 className={cn(H3, "mt-6 text-[1.4rem] leading-[1.15]")}>
                <span className="sr-only">{`Quarter ${i + 1}: `}</span>
                {s.title}
              </h3>
              <p className="mt-3 max-w-[36ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground">
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
