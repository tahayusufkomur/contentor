import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** Studio tips and FAQs with sticky-note styled expandable cards. */
export function FaqTips({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section tone="kraft" label={str(block.heading) || "Questions"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        <div className="lg:col-span-5">
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
                "mt-3 block text-[clamp(1.8rem,1.4rem+1.8vw,3rem)] leading-[1.08]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-5 block max-w-[38ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
            />
          </div>
        </div>

        <div className="workshop-faq lg:col-span-7">
          <div className="space-y-4">
            {items.map((it, i) => (
              <details
                key={i}
                className="group rounded-[var(--radius)] border-2 border-dashed border-border bg-card p-6 shadow-xs transition-colors open:border-primary/60"
                open={i === 0}
              >
                <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
                  <span className="workshop-faq-q text-balance font-display text-[1.2rem] font-bold leading-snug transition-colors group-hover:text-primary md:text-[1.3rem]">
                    {it.q}
                  </span>
                  <span
                    className="workshop-plus text-primary"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-4 max-w-[56ch] text-pretty text-[1rem] leading-[1.7] text-muted-foreground">
                  {it.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
