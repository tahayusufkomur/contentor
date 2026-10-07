import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, Halo, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Size the quote to its length: a short line gets poster scale, a long one
 *  stays readable. */
function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.75rem,1.4rem+5.4vw,7rem)] leading-[1.0] max-w-[16ch]";
  if (len <= 140)
    return "text-[clamp(2.25rem,1.3rem+3.6vw,5rem)] leading-[1.06] max-w-[22ch]";
  return "text-[clamp(1.9rem,1.25rem+2.5vw,3.75rem)] leading-[1.12] max-w-[28ch]";
}

/** A quiet philosophy statement sized to its length, with an optional arched
 *  atmosphere print below. */
export function PhilosophyWhisper({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label="Philosophy">
      <div className={cn(WRAP, "flex flex-col items-center text-center")}>
        <figure className="flex flex-col items-center text-center">
          <Kicker block={block} editable={editable} />
          <blockquote>
            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "nocturne-soft mt-6 block text-balance break-words font-display font-light tracking-[-0.01em]",
                quoteSize(statement.length),
              )}
            />
          </blockquote>
          {has(block, "attribution", editable) && (
            <figcaption className="mt-10 flex items-center justify-center gap-4">
              <span aria-hidden="true" className="h-px w-10 bg-accent" />
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
          <Halo className="mt-14 w-full max-w-[48rem] [--nocturne-halo:0.5]">
            <Img
              value={block.image}
              alt={statement.slice(0, 120)}
              className={cn(ARCH, "aspect-[16/9] w-full max-w-[48rem]")}
            />
          </Halo>
        )}
      </div>
    </Section>
  );
}
