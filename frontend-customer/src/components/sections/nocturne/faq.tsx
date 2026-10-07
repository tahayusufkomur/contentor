import { itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Opener, Section, WRAP, str } from "./ui";

type QA = { q?: string; a?: string };

/** Frequently asked questions in soft night pills that open with rotating
 *  chevrons. */
export function FaqSoft({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");

  return (
    <Section label={str(block.heading) || "Questions"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        <div className="mx-auto mt-14 max-w-[46rem] nocturne-faq space-y-3">
          {items.map((it, i) => (
            <details
              key={i}
              className="rounded-[var(--radius)] border border-border bg-muted px-6"
              open={i === 0}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-5">
                <span className="text-balance text-[1.1rem] font-medium md:text-[1.2rem]">
                  {it.q}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="nocturne-chev size-5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <p className="max-w-[58ch] pb-6 pr-8 text-[1rem] leading-[1.7] text-muted-foreground">
                {it.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
