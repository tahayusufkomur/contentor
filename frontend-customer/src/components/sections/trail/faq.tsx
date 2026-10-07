import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, Waypoint, str } from "./ui";

type QA = { q?: string; a?: string };

/** Ranger FAQ: questions marked with waypoint discs and plus toggles, with a sticky heading column. */
export function FaqRanger({ block, editable }: SectionProps) {
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
                "mt-4 block text-[clamp(1.8rem,1.4rem+1.7vw,3rem)] leading-[1.06]",
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

        <div className="trail-faq border-b border-border lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-5">
                <Waypoint n={i + 1} className="size-7 text-[0.7rem]" />
                <span className="trail-q text-balance text-[1.15rem] font-semibold md:text-[1.3rem]">
                  {it.q}
                </span>
                <span
                  className="trail-plus translate-y-[-0.1em]"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[60ch] pb-6 pl-[3.5rem] pr-8 text-pretty text-[1rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
