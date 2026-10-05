import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Size the quote to its length: a short line gets poster scale, a long one
 *  stays readable. */
function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.75rem,1.4rem+5.4vw,7rem)] leading-[1.0] max-w-[16ch]";
  if (len <= 140)
    return "text-[clamp(2.25rem,1.3rem+3.6vw,5rem)] leading-[1.06] max-w-[22ch]";
  return "text-[clamp(1.9rem,1.25rem+2.5vw,3.75rem)] leading-[1.12] max-w-[28ch]";
}

/** A full-width pull quote with the opening mark hung in the margin, set on
 *  the greige stock, with an optional wide atmosphere print beneath. */
export function PhilosophyPullquote({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section tone="surface" label="Philosophy">
      <div className={WRAP}>
        <figure className="lg:pl-[8.333%]">
          <Kicker block={block} editable={editable} className="mb-8" />
          <blockquote className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[0.5em] top-0 hidden select-none font-display text-[clamp(2.75rem,1.4rem+5.4vw,7rem)] font-light leading-[1] text-accent sm:block"
            >
              &ldquo;
            </span>
            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "block text-balance break-words font-display font-light tracking-[-0.02em]",
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
          <Img
            value={block.image}
            alt={statement.slice(0, 120)}
            imgClassName="object-[50%_30%]"
            className="mt-16 aspect-[4/3] w-full sm:aspect-[16/9] md:mt-24 lg:ml-auto lg:aspect-[2/1] lg:w-[91.667%]"
          />
        )}
      </div>
    </Section>
  );
}
