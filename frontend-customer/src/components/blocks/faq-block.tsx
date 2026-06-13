"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockComponentProps } from "@/lib/blocks/types";

interface FaqItem {
  q?: string;
  a?: string;
}

export function FaqBlock({ data }: BlockComponentProps) {
  const [open, setOpen] = useState<number | null>(null);
  const items: FaqItem[] = (data.items ?? []).filter((it: FaqItem) => it?.q);
  if (!items.length) return null;
  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4">
        {data.heading && (
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="overflow-hidden rounded-lg border bg-background">
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-accent/50"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    open === i && "rotate-180",
                  )}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
