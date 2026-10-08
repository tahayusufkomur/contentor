import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { DoubleRule, Fleuron, H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** Course queries and FAQs formatted as footnote annotations with superscript
 *  index numerals and accordion definitions. */
export function FaqNotes({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section tone="paper" label={str(block.heading) || "Notes"}>
      <div className={WRAP}>
        <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          {/* Header */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <Kicker
                block={block}
                editable={editable}
                className="justify-start"
              />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(
                  H2,
                  "mt-3 block text-[clamp(1.8rem,1.4rem+1.8vw,3rem)] leading-[1.12]",
                )}
              />
              <div className="my-5 flex justify-start">
                <Fleuron />
              </div>
              <Txt
                block={block}
                field="intro"
                editable={editable}
                as="p"
                placeholder="Intro"
                className="mt-4 block max-w-[36ch] text-pretty text-[1.05rem] leading-[1.75] text-muted-foreground"
              />
            </div>
          </div>

          {/* Footnotes list */}
          <div className="lg:col-span-7">
            <DoubleRule className="mb-0 mt-0" />
            <div className="manuscript-faq divide-y divide-border border-b border-border">
              {items.map((it, i) => (
                <details key={i} className="group py-5" open={i === 0}>
                  <summary className="flex cursor-pointer items-baseline justify-between gap-4">
                    <div className="flex items-baseline gap-3">
                      <sup className="manuscript-small-caps shrink-0 text-sm font-semibold text-accent">
                        [{i + 1}]
                      </sup>
                      <span className="manuscript-term font-display text-[1.2rem] font-normal leading-snug text-foreground transition-colors group-hover:text-accent md:text-[1.35rem]">
                        {it.q}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-display text-lg font-light text-accent transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[54ch] pl-7 pr-4 text-pretty text-[1.02rem] leading-[1.8] text-muted-foreground">
                    {it.a}
                  </p>
                </details>
              ))}
            </div>
            <DoubleRule className="mt-0" />
          </div>
        </div>
      </div>
    </Section>
  );
}
