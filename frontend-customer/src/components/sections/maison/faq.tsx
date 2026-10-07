import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, roman, str } from "./ui";

type QA = { q?: string; a?: string };

/** Notes: questions listed with roman numerals; the numeral goes italic on open. */
export function FaqNotes({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Notes"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(
                H2,
                "mt-5 block text-[clamp(1.8rem,1.4rem+1.8vw,3.2rem)] leading-[1.02]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-7 block max-w-[34ch] text-pretty font-light text-[1rem] leading-[1.7] text-muted-foreground"
            />
          </div>
        </div>

        <div className="maison-faq border-b border-border lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-5 py-6">
                <span
                  className="maison-num maison-opsz font-display text-[1.4rem] leading-none"
                  aria-hidden="true"
                >
                  {roman(i)}
                </span>
                <span className="text-balance font-display text-[1.25rem] md:text-[1.45rem]">
                  {it.q}
                </span>
                <span
                  className="maison-plus translate-y-[-0.15em]"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[52ch] pb-7 pl-12 pr-8 font-light text-[1rem] leading-[1.8] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
