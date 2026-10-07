import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** Course glossary and FAQs with expandable terms and definitions. */
export function FaqGlossary({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Questions"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-10")}>
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
                "mt-4 block text-[clamp(1.8rem,1.4rem+1.7vw,3rem)] leading-[1.08]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-6 block max-w-[36ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
            />
          </div>
        </div>

        <div className="primer-faq border-b border-border lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-5">
                <span className="primer-term text-balance font-display text-[1.2rem] font-semibold leading-snug md:text-[1.35rem]">
                  {it.q}
                </span>
                <span
                  className="primer-plus translate-y-[-0.1em]"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[60ch] pb-6 pr-8 text-pretty text-[1.02rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
