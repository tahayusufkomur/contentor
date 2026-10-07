import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, pad2, str } from "./ui";

type QA = { q?: string; a?: string };

/** Frequently asked questions presented with didactic numbering and quiet disclosures. */
export function FaqDidactics({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Questions"}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-12 border-t border-foreground pt-4 lg:grid-cols-12 lg:gap-x-10",
        )}
      >
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
                "mt-3 block text-[clamp(1.7rem,1.3rem+1.6vw,2.8rem)] leading-[1.05]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-6 block max-w-[36ch] text-pretty text-[1rem] leading-[1.6] text-muted-foreground"
            />
          </div>
        </div>

        <div className="darkroom-faq border-b border-border lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="flex cursor-pointer items-baseline gap-5 py-6">
                <span
                  className="darkroom-num darkroom-mono darkroom-tnum w-10 shrink-0 text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground"
                  aria-hidden="true"
                >
                  {pad2(i)}
                </span>
                <span className="flex-1 text-balance text-[1.1rem] font-medium leading-snug md:text-[1.25rem]">
                  {it.q}
                </span>
                <span
                  className="darkroom-plus translate-y-[-0.15em]"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[60ch] pb-8 pl-[3.75rem] pr-8 text-pretty text-[0.98rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
