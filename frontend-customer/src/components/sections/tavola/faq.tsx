import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** The pantry: frequently asked questions with sticky title and dotted rows. */
export function FaqPantry({ block, editable }: SectionProps) {
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
                "mt-4 block max-w-[18ch] text-[clamp(1.8rem,1.4rem+1.7vw,3rem)] leading-[1.06]",
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

        <div className="tavola-faq lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-b-2 border-dotted border-border"
              open={i === 0}
            >
              <summary className="flex cursor-pointer items-baseline justify-between gap-6 py-5">
                <span className="tavola-q text-balance font-display text-[1.2rem] leading-snug md:text-[1.35rem]">
                  {it.q}
                </span>
                <span
                  className="tavola-plus translate-y-[-0.1em]"
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
