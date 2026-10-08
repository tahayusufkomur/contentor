import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Fleuron, Kicker, Section, WRAP, str } from "./ui";

function quoteSize(len: number) {
  if (len <= 80)
    return "text-[clamp(2.2rem,1.3rem+3.2vw,4.2rem)] leading-[1.12]";
  if (len <= 150)
    return "text-[clamp(1.75rem,1.2rem+2.2vw,3rem)] leading-[1.22]";
  return "text-[clamp(1.45rem,1.15rem+1.4vw,2.2rem)] leading-[1.35]";
}

/** Philosophy epigraph: centred italic quote with a hairline rule,
 *  small-caps running head, attribution, and an optional landscape plate. */
export function PhilosophyEpigraph({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label="Philosophy">
      <div className={WRAP}>
        <div className="mx-auto max-w-[42rem] text-center">
          <Kicker block={block} editable={editable} />

          <blockquote className="mt-6">
            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "block text-balance break-words font-display font-light italic text-foreground",
                quoteSize(statement.length),
              )}
            />
          </blockquote>

          <hr
            aria-hidden="true"
            className="mx-auto my-7 w-20 border-t border-border"
          />

          {has(block, "attribution", editable) && (
            <p className="font-display text-[1.15rem] italic text-accent">
              <span aria-hidden="true">—&nbsp;</span>
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                placeholder="Attribution"
              />
            </p>
          )}

          <div className="mt-6 flex justify-center">
            <Fleuron />
          </div>
        </div>

        {showImage && (
          <figure className="mx-auto mt-14 max-w-[50rem]">
            <div className="manuscript-plate">
              <Img
                value={block.image}
                alt={statement.slice(0, 100) || "Atmosphere"}
                className="aspect-[16/9] w-full"
              />
            </div>
          </figure>
        )}
      </div>
    </Section>
  );
}
