import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** Atelier consultation & FAQ accordion with delicate champagne hairlines and plus/minus toggles. */
export function FaqConsult({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Consultation"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-10")}>
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Consultation"
              className={cn(
                H2,
                "mt-4 block text-[clamp(1.8rem,1.35rem+1.8vw,3.2rem)] leading-[1.08]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-5 block max-w-[38ch] text-pretty text-[1.05rem] leading-[1.7] text-muted-foreground"
            />
          </div>
        </div>

        <div className="atelier-faq border-b border-[color-mix(in_oklch,var(--border)_80%,transparent)] lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-[color-mix(in_oklch,var(--border)_80%,transparent)]"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-5 sm:py-6">
                <span className="atelier-q font-display text-[1.25rem] font-medium leading-snug transition-colors group-hover:text-primary md:text-[1.38rem]">
                  {it.q}
                </span>
                <span
                  className="atelier-plus translate-y-[-0.1em] text-accent"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[56ch] pb-6 pr-6 text-pretty text-[1rem] leading-[1.75] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
