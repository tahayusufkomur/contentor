import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, Page, Section, WRAP, str } from "./ui";

/** Size the quote to its length: a short line gets poster scale, a long one stays readable. */
function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.75rem,1.4rem+5.4vw,7rem)] leading-[1.0] max-w-[16ch]";
  if (len <= 140)
    return "text-[clamp(2.25rem,1.3rem+3.6vw,5rem)] leading-[1.06] max-w-[22ch]";
  return "text-[clamp(1.9rem,1.25rem+2.5vw,3.75rem)] leading-[1.12] max-w-[28ch]";
}

/** Philosophy statement written large across ruled paper with an attribution margin note. */
export function PhilosophyMarginNote({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="ruled" label="Philosophy">
      <div className={WRAP}>
        <Page>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="statement"
            editable={editable}
            as="p"
            placeholder="Statement"
            className={cn(
              "mt-6 block text-balance break-words font-display font-semibold tracking-[-0.015em]",
              quoteSize(statement.length),
            )}
          />
          {has(block, "attribution", editable) && (
            <p className="primer-courier mt-8 text-[0.95rem] text-accent">
              <span aria-hidden="true">&mdash;&nbsp;</span>
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                placeholder="Attribution"
              />
            </p>
          )}
          {showImage && (
            <Img
              value={block.image}
              alt={statement.slice(0, 120)}
              className="primer-print mt-14 aspect-[16/9] w-full max-w-[40rem] rotate-[-1deg]"
            />
          )}
        </Page>
      </div>
    </Section>
  );
}
