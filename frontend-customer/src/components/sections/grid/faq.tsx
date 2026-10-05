import { itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, pad, row } from "./ui";

type QA = { q?: string; a?: string };

/** Every answer visible: number, question, answer on one ruled line. */
export function FaqOpen({ block, editable }: SectionProps) {
  const items = itemsOf<QA>(block, "items");
  return (
    <Sheet>
      <Head block={block} editable={editable} />
      <dl className="mt-14 border-b border-foreground md:mt-20">
        {items.map((it, i) => (
          <div
            key={i}
            className={`${row} gap-y-3 border-t border-foreground py-6 md:py-8`}
          >
            <span
              aria-hidden="true"
              className="swiss-mono col-span-12 text-muted-foreground md:col-span-3"
            >
              Q{pad(i + 1)}
            </span>
            <dt className="swiss-h3 col-span-12 text-balance md:col-span-4 md:col-start-4">
              {it.q}
            </dt>
            <dd className="col-span-12 max-w-[60ch] text-[1.0625rem] leading-[1.55] md:col-span-5 md:col-start-8">
              {it.a}
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
