import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Size the quote to its length: a short line gets poster scale, a long one stays readable. */
function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.75rem,1.4rem+5.4vw,7rem)] leading-[1.0] max-w-[16ch]";
  if (len <= 140)
    return "text-[clamp(2.25rem,1.3rem+3.6vw,5rem)] leading-[1.06] max-w-[22ch]";
  return "text-[clamp(1.9rem,1.25rem+2.5vw,3.75rem)] leading-[1.12] max-w-[28ch]";
}

/** The maxim: a high-contrast italic statement centred on the black band. */
export function PhilosophyMaxim({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="black" label="Philosophy">
      <div className={cn(WRAP, "flex flex-col items-center text-center")}>
        <Kicker block={block} editable={editable} />
        <Txt
          block={block}
          field="statement"
          editable={editable}
          as="p"
          placeholder="Statement"
          className={cn(
            "maison-opsz mt-8 block text-balance break-words font-display font-normal italic tracking-[-0.01em]",
            quoteSize(statement.length),
          )}
        />
        {has(block, "attribution", editable) && (
          <p className={cn(LABEL, "mt-12 text-muted-foreground")}>
            <Txt
              block={block}
              field="attribution"
              editable={editable}
              placeholder="Attribution"
            />
          </p>
        )}
        {showImage && (
          <div className="mt-16 aspect-[16/9] w-full max-w-[44rem] border border-[var(--inverse-foreground)] p-2.5">
            <Img
              value={block.image}
              alt={statement.slice(0, 120)}
              className="aspect-[16/9] w-full"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
