import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, LABEL_ACCENT, Opener, Section, WRAP, pad2, str } from "./ui";

type Step = { title?: string; text?: string };

/** Step-by-step process as dance rehearsal cue cards: big numbered cards
 *  with cue tags, stretched headings, and optional mirror wall photo panel. */
export function HowItWorksRehearsal({ block, editable }: SectionProps) {
  const steps = itemsOf<Step>(block, "steps");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const cueCards = (
    <ol
      className="grid gap-6 md:grid-cols-2 lg:grid-cols-[repeat(var(--studiofloor-cols),minmax(0,1fr))]"
      style={
        { "--studiofloor-cols": Math.max(steps.length, 1) } as CSSProperties
      }
    >
      {steps.map((s, i) => (
        <li
          key={i}
          className="studiofloor-card flex flex-col justify-between rounded-[var(--radius)] p-7 md:p-8"
        >
          <div>
            <div className="flex items-center justify-between border-b border-border/80 pb-4">
              <span className={LABEL_ACCENT}>CUE {pad2(i)}</span>
              <span
                aria-hidden="true"
                className="studiofloor-display text-xs font-bold text-muted-foreground"
              >
                PHASE 0{i + 1}
              </span>
            </div>
            <h3 className={cn(H3, "mt-6 text-[1.3rem] leading-snug")}>
              <span className="sr-only">{`Step ${i + 1}: `}</span>
              {s.title}
            </h3>
            <p className="mt-3 text-[0.98rem] leading-[1.65] text-muted-foreground">
              {s.text}
            </p>
          </div>
          <div className="mt-8 flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1 w-6 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]"
            />
            <span
              aria-hidden="true"
              className="h-1 w-2 rounded-full bg-border"
            />
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} cue="REHEARSAL" />

        {showImage ? (
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:col-span-8">{cueCards}</div>
            <div className="lg:col-span-4">
              <div className="relative overflow-hidden rounded-[var(--radius)] border border-primary/40 shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_20%,transparent)] lg:sticky lg:top-24">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
                <div
                  aria-hidden="true"
                  className="studiofloor-lightbar absolute inset-0 pointer-events-none"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-14">{cueCards}</div>
        )}
      </div>
    </Section>
  );
}
