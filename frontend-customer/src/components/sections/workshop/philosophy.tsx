import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, Section, WRAP, WashiTape, str } from "./ui";

function statementSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.5rem,1.4rem+4.5vw,5.5rem)] leading-[1.02] max-w-[18ch]";
  if (len <= 140)
    return "text-[clamp(2rem,1.3rem+3.2vw,4.2rem)] leading-[1.06] max-w-[24ch]";
  return "text-[clamp(1.75rem,1.2rem+2.2vw,3.2rem)] leading-[1.12] max-w-[30ch]";
}

/** Philosophy note: a crafted note pinned to the bench with washi tape,
 *  warm display quote and handwritten Caveat attribution. */
export function PhilosophyNote({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="kraft" label="Philosophy">
      <div className={WRAP}>
        <div className="mx-auto max-w-4xl">
          <div className="workshop-polaroid workshop-lined relative rounded-[var(--radius)] border border-border p-8 sm:p-12 md:p-16 shadow-sm">
            <WashiTape
              tone="accent"
              className="-top-3 left-1/2 -translate-x-1/2 rotate-[-1.5deg]"
            />

            <Kicker block={block} editable={editable} />

            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "mt-6 block text-balance break-words font-display font-bold tracking-[-0.015em] text-foreground",
                statementSize(statement.length),
              )}
            />

            {has(block, "attribution", editable) && (
              <div className="mt-8 flex items-center gap-3">
                <span aria-hidden="true" className="h-px w-8 bg-border" />
                <p className="workshop-hand text-[1.5rem] font-bold leading-none text-accent rotate-[-1deg]">
                  <Txt
                    block={block}
                    field="attribution"
                    editable={editable}
                    placeholder="Attribution"
                  />
                </p>
              </div>
            )}
          </div>

          {showImage && (
            <figure className="workshop-polaroid relative mx-auto mt-12 max-w-2xl rounded-sm p-3 pb-7 sm:p-4 sm:pb-9 shadow-md lg:rotate-[-1deg]">
              <WashiTape
                tone="primary"
                className="-top-3 right-8 rotate-[8deg]"
              />
              <Img
                value={block.image}
                alt={statement.slice(0, 120)}
                className="aspect-[16/9] w-full rounded-[2px]"
              />
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
