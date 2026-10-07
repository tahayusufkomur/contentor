import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, NUM, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** FAQ B-sides: accordion questions numbered like B-side tracks with rotating plus markers beside a sticky intro column. */
export function FaqBSides({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");
  const alt = str(block.heading) || "Questions";

  return (
    <Section label={alt}>
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
                "mt-4 block text-[clamp(1.6rem,1.2rem+1.8vw,3rem)] leading-[0.98]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-6 block max-w-[36ch] text-pretty text-[1.02rem] leading-[1.6] text-muted-foreground"
            />
          </div>
        </div>

        <div className="encore-faq border-t-[3px] border-foreground lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-b border-foreground"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-5">
                <span
                  className={cn(LABEL, NUM, "encore-num")}
                  aria-hidden="true"
                >
                  B{i + 1}
                </span>
                <span className="text-balance text-[1.1rem] font-semibold md:text-[1.25rem]">
                  {it.q}
                </span>
                <span
                  className="encore-plus translate-y-[-0.1em]"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[60ch] pb-6 pl-12 pr-8 text-[0.98rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
