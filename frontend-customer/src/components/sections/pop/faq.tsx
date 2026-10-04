import { cn } from "@/lib/utils";
import { Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { FILL, Kicker, PopSection, WRAP } from "./ui";

type QA = { q?: string; a?: string };

const BUBBLE = ["lilac", "pink", "lime", "sun"] as const;
const TAIL: Record<(typeof BUBBLE)[number], string> = {
  lilac: "var(--card)",
  pink: "var(--pop-pink)",
  lime: "var(--accent)",
  sun: "var(--pop-sun)",
};

/** Speech-bubble tail hanging off the bubble's bottom border. */
function Tail({ className, fill }: { className: string; fill: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 22 16"
      className={cn("pointer-events-none absolute top-[calc(100%-2px)] h-4 w-[22px] overflow-visible", className)}
    >
      <path d="M1 0 V15 L20 0" style={{ fill, stroke: "var(--foreground)" }} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** FAQ as a conversation: question bubbles on the left, the answer replies
 *  from the right when opened. */
export function FaqBubbles({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");
  return (
    <PopSection bg="var(--background)" className="py-20 md:py-28">
      <div className={cn(WRAP, "grid gap-x-16 gap-y-12 lg:grid-cols-12")}>
        <div className="lg:col-span-5 lg:self-start lg:sticky lg:top-24">
          <Kicker block={block} editable={editable} fill="lime" />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className="pop-display pop-h2 mt-6"
            placeholder="Heading"
          />
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            className="pop-lede mt-6 max-w-[30rem] text-muted-foreground"
          />
        </div>

        <div className="space-y-5 lg:col-span-7">
          {items.map((it, i) => (
            <details key={i} className="pop-faq group" open={i === 0}>
              <summary
                className={cn(
                  "pop-card pop-lift relative flex cursor-pointer items-center justify-between gap-5 px-6 py-5 md:px-7",
                  FILL[BUBBLE[i % BUBBLE.length]],
                )}
              >
                <Tail className="left-9" fill={TAIL[BUBBLE[i % BUBBLE.length]]} />
                <span className="pop-h3 text-[1.3125rem] md:text-[1.5rem]">{it.q}</span>
                <span
                  aria-hidden="true"
                  className="pop-plus flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--pop-ink)] bg-[var(--pop-paper)] group-open:rotate-45"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" style={{ stroke: "var(--foreground)" }} strokeWidth="2.5" strokeLinecap="round">
                    <path d="M8 2v12M2 8h12" />
                  </svg>
                </span>
              </summary>
              <div className="flex justify-end pl-8 pt-4 md:pl-16">
                <p className="relative rounded-[var(--pop-r)] border-2 border-[color:var(--pop-ink)] bg-[var(--pop-paper)] px-6 py-5 text-base leading-relaxed md:px-7">
                  {it.a}
                  <Tail className="right-9 -scale-x-100" fill="var(--pop-paper)" />
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </PopSection>
  );
}
