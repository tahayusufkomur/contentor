import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Kicker,
  MoonPhases,
  Section,
  StarGlyph,
  WRAP,
  ZodiacRing,
  str,
} from "./ui";

function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.2rem,1.4rem+4.2vw,4.6rem)] leading-[1.12] max-w-[18ch]";
  if (len <= 140)
    return "text-[clamp(1.8rem,1.3rem+2.8vw,3.6rem)] leading-[1.18] max-w-[24ch]";
  return "text-[clamp(1.5rem,1.2rem+1.8vw,2.8rem)] leading-[1.24] max-w-[32ch]";
}

/** Philosophy "invocation": Centred uppercase ceremonial decree within the Zodiac Ring. */
export function PhilosophyInvocation({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label="Invocation">
      <div className={cn(WRAP, "relative")}>
        {/* Background Zodiac Ring */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ZodiacRing size={600} className="opacity-30" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
          <Kicker block={block} editable={editable} />
          <MoonPhases className="mt-4" />

          <Txt
            block={block}
            field="statement"
            editable={editable}
            as="p"
            placeholder="Statement"
            className={cn(
              "mt-8 block text-balance break-words font-display font-medium uppercase tracking-[0.06em] text-foreground",
              quoteSize(statement.length),
            )}
          />

          {has(block, "attribution", editable) && (
            <div className="mt-8 inline-flex items-center gap-2 font-display text-[0.95rem] uppercase tracking-[0.16em] text-primary">
              <StarGlyph className="size-3" />
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                placeholder="Attribution"
              />
              <StarGlyph className="size-3" />
            </div>
          )}

          {showImage && (
            <figure className="relative mt-16 w-full max-w-3xl overflow-hidden rounded-[var(--radius)] border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] p-1.5 shadow-2xl">
              <Img
                value={block.image}
                alt={statement.slice(0, 120)}
                className="aspect-[16/9] w-full rounded-[calc(var(--radius)-4px)]"
              />
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
