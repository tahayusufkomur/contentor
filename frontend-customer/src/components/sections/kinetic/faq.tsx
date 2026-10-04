import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { DISPLAY, Kicker, LABEL, WRAP, pad2 } from "./ui";

type QA = { q?: string; a?: string };

/** Numbered caps questions on thick rules; square plus/minus. */
export function FaqNumbered({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");
  return (
    <section className="kinetic-paper py-20 md:py-32">
      <div className={cn(WRAP, "grid gap-12 lg:grid-cols-12 lg:gap-8")}>
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(
                DISPLAY,
                "mt-5 text-[clamp(2.75rem,1rem+3.4vw,5rem)]",
              )}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="mt-6 max-w-[40ch] text-lg leading-[1.55] text-muted-foreground"
            />
          </div>
        </div>

        <div className="border-b-[3px] border-foreground lg:col-span-8">
          {items.map((it, i) => (
            <details
              key={i}
              className="kinetic-faq group border-t-[3px] border-foreground"
            >
              <summary className="kinetic-focus-out grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-start gap-x-4 py-6 md:gap-x-8 md:py-7">
                <span
                  className={cn(LABEL, "pt-[0.55em] tabular-nums text-primary")}
                >
                  Q.{pad2(i)}
                </span>
                <span
                  className={cn(
                    DISPLAY,
                    "text-[clamp(1.6rem,1.1rem+1.5vw,2.6rem)] [line-height:0.95] transition-colors group-hover:text-primary",
                  )}
                >
                  {it.q}
                </span>
                <span
                  aria-hidden="true"
                  className="kinetic-plus relative grid size-10 shrink-0 place-items-center border-[3px] border-foreground transition-colors md:size-12"
                >
                  <span className="absolute h-[3px] w-4 bg-current md:w-5" />
                  <span className="kinetic-plus-v absolute h-4 w-[3px] bg-current md:h-5" />
                </span>
              </summary>
              <p className="max-w-[62ch] pb-8 pl-[calc(2.4rem+1rem)] pr-14 text-lg leading-[1.6] text-muted-foreground md:pl-[calc(2.6rem+2rem)]">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
