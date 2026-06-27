"use client";

import { useId, useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlockPlaceholder } from "./block-placeholder";
import type { BlockComponentProps } from "@/lib/blocks/types";

interface FaqItem {
  q?: string;
  a?: string;
}

export function FaqBlock({ data, editable }: BlockComponentProps) {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  const items: FaqItem[] = (data.items ?? []).filter((it: FaqItem) => it?.q);

  if (!items.length)
    return editable ? (
      <BlockPlaceholder
        icon={HelpCircle}
        title="No questions yet"
        description="Add your first question from the editor panel on the left."
      />
    ) : null;

  const layout = data.layout || "accordion";

  const heading = data.heading && (
    <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
      {data.heading}
    </h2>
  );

  // FAQPage structured data for rich results. q/a are plain text; "<" is escaped
  // so the JSON can never break out of the <script> tag.
  const entities = items
    .filter((it) => it.q && it.a)
    .map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    }));
  const schema = entities.length > 0 && (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: entities,
        }).replace(/</g, "\\u003c"),
      }}
    />
  );

  // Two columns: all answers shown, in a 2-up grid.
  if (layout === "columns") {
    return (
      <section className="py-16">
        {schema}
        <div className="mx-auto max-w-5xl px-4">
          {heading}
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {items.map((item, i) => (
              <div key={i}>
                <h3 className="font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Open list: all answers shown, single column.
  if (layout === "open") {
    return (
      <section className="py-16">
        {schema}
        <div className="mx-auto max-w-3xl space-y-6 px-4">
          {heading}
          {items.map((item, i) => (
            <div key={i}>
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Accordion (default): collapsible.
  return (
    <section className="py-16">
      {schema}
      <div className="mx-auto max-w-3xl px-4">
        {heading}
        <div className="space-y-2">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className="overflow-hidden rounded-lg border bg-background"
              >
                <button
                  id={`${baseId}-q-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`${baseId}-a-${i}`}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-accent/50"
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <div
                    id={`${baseId}-a-${i}`}
                    role="region"
                    aria-labelledby={`${baseId}-q-${i}`}
                    className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground"
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
