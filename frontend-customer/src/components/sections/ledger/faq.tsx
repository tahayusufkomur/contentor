import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Ref, RunningHead, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** FAQ formatted as an appendix: sticky title column with running head,
 *  lettered clauses A-Z that highlight oxblood when open. */
export function FaqAppendix({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Questions"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-10")}>
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <RunningHead block={block} editable={editable} right="Appendix" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(
                H2,
                "mt-6 block text-[clamp(2.1rem,1.6rem+1.9vw,3.4rem)] leading-[1.06]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              placeholder="Intro"
              className="mt-7 block max-w-[36ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
            />
          </div>
        </div>

        <div className="ledger-faq border-b border-border lg:col-span-7 lg:col-start-6">
          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-4 py-6">
                <Ref className="ledger-ref">
                  {String.fromCharCode(65 + (i % 26))}.
                </Ref>
                <span className="text-balance font-display text-[1.3rem] leading-snug md:text-[1.5rem]">
                  {it.q}
                </span>
                <span className="ledger-plus" aria-hidden="true" />
              </summary>
              <p className="max-w-[60ch] pb-8 pl-12 text-pretty text-[1.0625rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
