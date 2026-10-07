import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { DISPLAY, Kicker, LABEL, Section, Stars, WRAP, str } from "./ui";

function statementSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.4rem,1.2rem+4.8vw,6.5rem)] leading-[0.98] max-w-[14ch]";
  if (len <= 140)
    return "text-[clamp(1.8rem,1.1rem+3vw,4.4rem)] leading-[0.98] max-w-[22ch]";
  return "text-[clamp(1.4rem,1rem+1.8vw,2.8rem)] leading-[0.98] max-w-[30ch]";
}

/** Philosophy manifesto: a full-width ink band with stars, heavy uppercase declaration and border-framed atmosphere photo. */
export function PhilosophyManifesto({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="ink"
      label={statement ? statement.slice(0, 80) : "Philosophy"}
    >
      <div className={cn(WRAP, "flex flex-col items-center text-center")}>
        <Stars className="text-accent" />
        <Kicker block={block} editable={editable} className="mt-6" />
        <Txt
          block={block}
          field="statement"
          editable={editable}
          as="p"
          placeholder="Statement"
          className={cn(DISPLAY, "mt-6 block", statementSize(statement.length))}
        />
        {has(block, "attribution", editable) && (
          <Txt
            block={block}
            field="attribution"
            editable={editable}
            as="p"
            placeholder="Attribution"
            className={cn(LABEL, "mt-10 text-muted-foreground")}
          />
        )}
        {showImage && (
          <div className="mt-14 w-full max-w-[52rem] border-[3px] border-[var(--inverse-foreground)] p-2">
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
