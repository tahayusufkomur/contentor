import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Fig, LABEL, RunningHead, Section, WRAP, str } from "./ui";

/** Size the statement to its length: short lines get poster scale, longer ones
 *  stay measured. */
function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.75rem,1.4rem+5.4vw,7rem)] leading-[1.0] max-w-[16ch]";
  if (len <= 140)
    return "text-[clamp(2.25rem,1.3rem+3.6vw,5rem)] leading-[1.06] max-w-[22ch]";
  return "text-[clamp(1.9rem,1.25rem+2.5vw,3.75rem)] leading-[1.12] max-w-[28ch]";
}

/** A core principle set on bone surface: running head, section mark in oxblood,
 *  light serif statement, and an optional wide framed plate below. */
export function PhilosophyPrinciples({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label="Philosophy">
      <div className={WRAP}>
        <RunningHead block={block} editable={editable} right="Principle" />

        <figure className="mt-12 lg:pl-[8.333%]">
          <span
            aria-hidden="true"
            className={cn(LABEL, "mb-6 block text-accent")}
          >
            § 1
          </span>
          <blockquote className="relative">
            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "block text-balance break-words font-display font-normal tracking-[-0.015em]",
                quoteSize(statement.length),
              )}
            />
          </blockquote>
          {has(block, "attribution", editable) && (
            <figcaption className="mt-10 flex items-center gap-4 text-muted-foreground md:mt-12">
              <span aria-hidden="true" className="h-px w-10 bg-current" />
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                placeholder="Attribution"
                className={LABEL}
              />
            </figcaption>
          )}
        </figure>

        {showImage && (
          <figure className="mt-16 sm:mt-20 md:mt-24 lg:ml-auto lg:w-[75%]">
            <Img
              value={block.image}
              alt={statement.slice(0, 120)}
              className="ledger-frame aspect-[16/9] w-full"
            />
            <Fig>{str(block.attribution) || null}</Fig>
          </figure>
        )}
      </div>
    </Section>
  );
}
