import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, MoonPhases, Section, StarGlyph, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** FAQ "questions": Gold hairline accordion with sacred star toggles. */
export function FaqQuestions({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section tone="temple" label={str(block.heading) || "Questions"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <Kicker block={block} editable={editable} />
            <MoonPhases className="mt-3.5 justify-start" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(
                H2,
                "mt-4 block max-w-[18ch] text-[clamp(1.8rem,1.3rem+1.8vw,3rem)]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-6 block max-w-[38ch] text-pretty text-[1.05rem] leading-[1.7] text-muted-foreground"
            />
          </div>
        </div>

        <div className="sanctum-faq border-b border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] lg:col-span-7">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-[color-mix(in_oklch,var(--primary)_28%,var(--border))]"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="text-balance font-display text-[1.125rem] font-medium tracking-[0.04em] leading-snug transition-colors group-hover:text-primary md:text-[1.25rem]">
                  {it.q}
                </span>
                <span className="sanctum-star-toggle flex size-6 shrink-0 items-center justify-center text-[color-mix(in_oklch,var(--primary)_70%,transparent)]">
                  <StarGlyph className="size-4 text-inherit" />
                </span>
              </summary>
              <p className="max-w-[58ch] pb-7 pr-6 text-pretty text-[1.02rem] leading-[1.75] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
