import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, Seal, Section, WRAP, str } from "./ui";

/** Size the creed according to text length. */
function creedSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.5rem,1.4rem+4.8vw,6rem)] leading-[1.0] max-w-[18ch]";
  if (len <= 130)
    return "text-[clamp(2.1rem,1.3rem+3.5vw,4.6rem)] leading-[1.05] max-w-[24ch]";
  return "text-[clamp(1.8rem,1.2rem+2.5vw,3.6rem)] leading-[1.12] max-w-[30ch]";
}

/** Philosophy creed: monumental centered creed flanked by vertical rules,
 *  grounded by the red seal stamp. */
export function PhilosophyCreed({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label="Philosophy">
      <div className={WRAP}>
        <div className="relative mx-auto max-w-5xl">
          {/* Vertical rules on desktop flanking the creed */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute -left-8 top-0 bottom-0 w-px bg-border/80"
          />
          <div
            aria-hidden="true"
            className="hidden lg:block absolute -right-8 top-0 bottom-0 w-px bg-border/80"
          />

          <div className="flex flex-col items-center text-center px-4 sm:px-8">
            <Kicker block={block} editable={editable} />

            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "mt-8 block text-balance break-words font-display font-extrabold tracking-[-0.02em] text-foreground",
                creedSize(statement.length),
              )}
            />

            {has(block, "attribution", editable) && (
              <p className="mt-8 text-[0.85rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <span aria-hidden="true">&mdash;&nbsp;</span>
                <Txt
                  block={block}
                  field="attribution"
                  editable={editable}
                  placeholder="Attribution"
                />
              </p>
            )}

            <div className="mt-8 flex justify-center">
              <Seal text="道" className="size-9 text-[1rem] shadow-sm" />
            </div>

            {showImage && (
              <div className="dojo-photo mt-14 aspect-[16/9] w-full max-w-4xl border border-border bg-background p-2.5 shadow-sm">
                <Img
                  value={block.image}
                  alt={statement.slice(0, 120)}
                  className="h-full w-full"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
