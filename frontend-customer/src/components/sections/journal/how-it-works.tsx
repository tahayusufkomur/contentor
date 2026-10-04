import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, H3, Kicker, Section, WRAP, str } from "./ui";

type Step = { title?: string; text?: string };

/** Steps as columns split by vertical hairlines, each opening on a large
 *  light italic figure in rubric red — the one place figures are earned. */
export function HowItWorksColumns({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <div className="grid gap-y-12 lg:grid-cols-12 lg:items-end lg:gap-x-10">
          <div className={showImage ? "lg:col-span-7" : "lg:col-span-8"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-5 block max-w-[17ch]")}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-7 block max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
            />
          </div>
          {showImage && (
            <div className="lg:col-span-3 lg:col-start-10">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[4/5] w-full sm:max-w-[20rem] lg:ml-auto lg:max-w-none"
              />
            </div>
          )}
        </div>

        <ol
          className="mt-16 grid border-t border-foreground md:mt-24 md:grid-cols-2 lg:grid-cols-[repeat(var(--journal-cols),minmax(0,1fr))]"
          style={{ "--journal-cols": Math.max(steps.length, 1) } as CSSProperties}
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className="border-b border-border py-10 md:max-lg:odd:pr-8 md:max-lg:even:border-l md:max-lg:even:pl-8 lg:border-b-0 lg:border-l lg:px-8 lg:pb-4 lg:first:border-l-0 lg:first:pl-0"
            >
              <span
                aria-hidden="true"
                className="journal-onum block font-display text-[5.5rem] font-light italic leading-[0.8] text-accent md:text-[7rem]"
              >
                {i + 1}
              </span>
              <h3 className={cn(H3, "mt-8 text-[1.5rem] leading-[1.15] md:text-[1.65rem]")}>
                <span className="sr-only">{`${i + 1}. `}</span>
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
