import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H1, Kicker, LABEL_ACCENT, Section, WRAP, str } from "./ui";

/** Sizing the philosophy statement to stay imposing at any character count. */
function quoteSize(len: number) {
  if (len <= 50)
    return "text-[clamp(2.8rem,1.4rem+6vw,7rem)] leading-[0.90] max-w-[18ch]";
  if (len <= 120)
    return "text-[clamp(2.2rem,1.3rem+4.2vw,5.2rem)] leading-[0.93] max-w-[24ch]";
  return "text-[clamp(1.8rem,1.2rem+2.8vw,3.8rem)] leading-[0.96] max-w-[30ch]";
}

/** Dance studio philosophy with a stage reflection: one huge pull statement
 *  mirrored directly underneath as a floor reflection, attribution, and
 *  an optional wide atmosphere print. */
export function PhilosophyMirror({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="stage" label="Philosophy">
      <div aria-hidden="true" className="studiofloor-stage-beam opacity-40" />

      <div
        className={cn(
          WRAP,
          "relative z-10 flex flex-col items-center text-center",
        )}
      >
        <figure className="flex flex-col items-center text-center">
          <Kicker block={block} editable={editable} cue="MANIFESTO" />

          <div className="relative mt-8">
            <blockquote>
              <Txt
                block={block}
                field="statement"
                editable={editable}
                as="p"
                placeholder="Statement"
                className={cn(
                  H1,
                  "block text-balance break-words",
                  quoteSize(statement.length),
                )}
              />
            </blockquote>

            {/* Mirrored floor reflection of the statement */}
            {statement && (
              <div
                aria-hidden="true"
                className={cn(
                  H1,
                  "studiofloor-mirror-text absolute inset-x-0 -bottom-8 block text-balance break-words select-none md:-bottom-12",
                  quoteSize(statement.length),
                )}
              >
                {statement}
              </div>
            )}
          </div>

          {has(block, "attribution", editable) && (
            <figcaption className="mt-14 flex items-center justify-center gap-3">
              <span
                aria-hidden="true"
                className="h-px w-8 bg-accent shadow-[0_0_6px_var(--accent)]"
              />
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                placeholder="Attribution"
                className={LABEL_ACCENT}
              />
              <span
                aria-hidden="true"
                className="h-px w-8 bg-accent shadow-[0_0_6px_var(--accent)]"
              />
            </figcaption>
          )}
        </figure>

        {showImage && (
          <div className="mt-16 w-full max-w-4xl">
            <div className="relative overflow-hidden rounded-[var(--radius)] border border-primary/40 shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_25%,transparent)]">
              <Img
                value={block.image}
                alt={statement.slice(0, 100) || "Atmosphere"}
                className="aspect-[16/9] w-full"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent pointer-events-none"
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
