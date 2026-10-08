import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Section, WRAP, pad2, str } from "./ui";

type QA = { q?: string; a?: string };

/** Course FAQ formatted as a UNIX manual page (man page) with expandable flags. */
export function FaqMan({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section tone="console" label={str(block.heading) || "Questions"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        {/* Left column: MAN(1) Header */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <div className="mb-4 font-mono text-xs text-primary font-bold">
              MANUAL(1) · FAQ REFERENCE
            </div>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(
                H2,
                "mt-4 block text-[clamp(1.8rem,1.4rem+1.8vw,3.2rem)] leading-[1.08]",
              )}
            />
            <div className="mt-6">
              <p
                className="font-mono text-xs text-muted-foreground select-none"
                aria-hidden="true"
              >
                {"// SYNOPSIS"}
              </p>
              <Txt
                block={block}
                field="intro"
                editable={editable}
                as="p"
                placeholder="Intro"
                className="mt-1 block max-w-[38ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {/* Right column: Options / Questions accordion */}
        <div className="terminal-faq border-b border-border lg:col-span-7">
          <div className="mb-3 font-mono text-xs text-accent font-bold uppercase tracking-wider">
            -- OPTIONS &amp; PARAMETERS
          </div>

          {items.map((it, i) => (
            <details
              key={i}
              className="group border-t border-border"
              open={i === 0}
            >
              <summary className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 py-5 font-mono text-[1.05rem] font-bold text-foreground transition-colors group-hover:text-primary md:text-[1.15rem]">
                <span
                  className="terminal-caret text-primary select-none"
                  aria-hidden="true"
                >
                  &gt;
                </span>
                <span className="text-balance">
                  <span
                    className="text-accent mr-2 font-normal text-sm"
                    aria-hidden="true"
                  >
                    -q{pad2(i)}
                  </span>
                  {it.q}
                </span>
              </summary>
              <div className="mb-4 ml-3 border-l-2 border-primary/30 pl-5 pb-4 pr-4">
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
