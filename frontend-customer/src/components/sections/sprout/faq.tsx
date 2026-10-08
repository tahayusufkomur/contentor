import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** FAQs laid out in pill-shaped rounded accordion rows with a playful '?' bubble. */
export function FaqAskaway({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section
      tone="paper"
      label={str(block.heading) || "Frequently Asked Questions"}
    >
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        {/* Sticky Left Column: Opener */}
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
                "mt-4 block text-[clamp(1.85rem,1.4rem+1.8vw,3rem)] leading-[1.12]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-4 block max-w-[40ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
            />
          </div>
        </div>

        {/* Right Column: Pill-shaped FAQ accordion rows */}
        <div className="sprout-faq space-y-4 lg:col-span-7">
          {items.map((it, i) => (
            <details
              key={i}
              className="group overflow-hidden rounded-[2rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] bg-card shadow-xs transition-colors"
              open={i === 0}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 sm:p-6 select-none">
                <span className="sprout-faq-question text-balance font-display text-[1.125rem] font-bold leading-snug text-foreground transition-colors md:text-[1.25rem]">
                  {it.q}
                </span>
                <span
                  aria-hidden="true"
                  className="sprout-faq-icon inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--accent)_30%,transparent)] font-display text-[1.15rem] font-bold text-accent-foreground"
                >
                  ?
                </span>
              </summary>
              <div className="px-5 pb-6 pt-1 sm:px-6">
                <p className="max-w-[56ch] text-pretty text-[1rem] leading-[1.7] text-muted-foreground">
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
