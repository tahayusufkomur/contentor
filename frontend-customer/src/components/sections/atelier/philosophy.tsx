import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Diamond, Divider, Kicker, Section, WRAP, str } from "./ui";

function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.5rem,1.4rem+5.2vw,6.5rem)] leading-[1.02] max-w-[16ch]";
  if (len <= 140)
    return "text-[clamp(2.1rem,1.3rem+3.6vw,4.8rem)] leading-[1.08] max-w-[24ch]";
  return "text-[clamp(1.8rem,1.2rem+2.4vw,3.6rem)] leading-[1.15] max-w-[30ch]";
}

/** Atelier philosophy: an enormous italic statement in Cormorant with delicate
 *  champagne ornaments and coach attribution. */
export function PhilosophyPullquote({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section label="Philosophy">
      <div className={WRAP}>
        <div className="mx-auto max-w-4xl text-center">
          <Kicker block={block} editable={editable} />

          <div className="mt-6">
            <span
              aria-hidden="true"
              className="font-display text-[4.5rem] italic leading-none text-accent"
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
                "mx-auto -mt-6 block text-balance break-words font-display italic font-normal tracking-[-0.01em]",
                quoteSize(statement.length),
              )}
            />
          </div>

          {has(block, "attribution", editable) && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Diamond />
              <p className="font-display text-[1.25rem] italic text-primary">
                <Txt
                  block={block}
                  field="attribution"
                  editable={editable}
                  placeholder="Coach name"
                />
              </p>
              <Diamond />
            </div>
          )}

          {showImage && (
            <div className="mt-14 sm:mt-16">
              <Divider className="mb-14" />
              <div className="overflow-hidden rounded-3xl border border-[color-mix(in_oklch,var(--border)_80%,transparent)] shadow-sm">
                <Img
                  value={block.image}
                  alt={statement.slice(0, 100) || "Philosophy"}
                  className="aspect-[16/9] w-full max-h-[32rem]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
