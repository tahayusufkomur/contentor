import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, pad2, str } from "./ui";

type QA = { q?: string; a?: string };

/** Dojo etiquette and FAQs laid out as numbered conduct rules. */
export function FaqEtiquette({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Dojo Etiquette"}>
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
                "mt-4 block text-[clamp(1.8rem,1.4rem+1.8vw,3rem)] leading-[1.06]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-6 block max-w-[36ch] text-pretty text-[1.05rem] leading-[1.68] text-muted-foreground"
            />
          </div>
        </div>

        <div className="dojo-faq border-b border-border lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-6 select-none transition-colors">
                <span
                  className="dojo-faq-num font-display text-[1.15rem] font-extrabold text-muted-foreground/70 transition-colors"
                  aria-hidden="true"
                >
                  {pad2(i)}.
                </span>
                <span className="text-balance font-display text-[1.15rem] font-bold leading-snug text-foreground md:text-[1.3rem]">
                  {it.q}
                </span>
                <span
                  aria-hidden="true"
                  className="font-mono text-base font-bold text-accent transition-transform duration-300 group-open:rotate-90 select-none"
                >
                  →
                </span>
              </summary>
              <div className="pb-7 pl-[3.75rem] pr-6">
                <p className="max-w-[58ch] text-pretty text-[1rem] leading-[1.7] text-muted-foreground">
                  {it.a}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
