import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** Frequently asked questions organized as a studio warmup accordion with
 *  custom rotating neon plus icons and primary highlight on open. */
export function FaqWarmup({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Questions"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <Kicker block={block} editable={editable} cue="WARMUP" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(
                H2,
                "mt-4 block text-[clamp(1.9rem,1.4rem+2.2vw,3.6rem)] leading-[0.96]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-6 block max-w-[38ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
            />
          </div>
        </div>

        <div className="studiofloor-faq border-b border-border/80 lg:col-span-7">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border/80 transition-colors"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-6 transition-colors group-hover:text-primary">
                <span className="studiofloor-display text-balance text-[1.2rem] font-extrabold italic leading-snug transition-colors md:text-[1.35rem]">
                  {it.q}
                </span>
                <span
                  className="studiofloor-plus text-primary"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[58ch] pb-7 pr-6 text-pretty text-[1rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
