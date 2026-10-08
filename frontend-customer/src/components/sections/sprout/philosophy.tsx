import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  HeartDoodle,
  Kicker,
  Section,
  StarDoodle,
  SunDoodle,
  WRAP,
  str,
} from "./ui";

function quoteSize(len: number) {
  if (len <= 60)
    return "text-[clamp(2.4rem,1.4rem+4.8vw,5.5rem)] leading-[1.08] max-w-[18ch]";
  if (len <= 130)
    return "text-[clamp(1.9rem,1.3rem+3.2vw,4rem)] leading-[1.14] max-w-[24ch]";
  return "text-[clamp(1.6rem,1.2rem+2vw,3rem)] leading-[1.2] max-w-[32ch]";
}

/** The coach's philosophy framed as a warm, reassuring promise inside
 *  a friendly speech-bubble container. */
export function PhilosophyPromise({ block, editable }: SectionProps) {
  const statement = str(block.statement);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label="Philosophy">
      {/* Playful background doodles */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-8 top-10 text-accent opacity-60 sprout-wiggle"
      >
        <StarDoodle className="size-10" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-12 left-8 text-primary opacity-30 sprout-float"
      >
        <SunDoodle className="size-12" />
      </div>

      <div className={WRAP}>
        <div className="mx-auto max-w-4xl">
          <Kicker block={block} editable={editable} className="mb-6" />

          {/* Speech bubble card */}
          <div className="sprout-speech-bubble relative border border-[color-mix(in_oklch,var(--border)_75%,transparent)] bg-card p-8 shadow-sm sm:p-12 md:p-16">
            {/* Little speech bubble tail indicator */}
            <div
              aria-hidden="true"
              className="absolute -bottom-4 left-10 size-8 rotate-45 border-b border-r border-[color-mix(in_oklch,var(--border)_75%,transparent)] bg-card"
            />

            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className={cn(
                "block text-balance break-words font-display font-semibold tracking-[-0.01em] text-foreground",
                quoteSize(statement.length),
              )}
            />

            {has(block, "attribution", editable) && (
              <div className="mt-8 flex items-center gap-3">
                <HeartDoodle className="size-5 text-primary opacity-80" />
                <p className="font-display text-[1.2rem] font-bold text-foreground">
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

          {/* Optional atmosphere photo */}
          {showImage && (
            <div className="relative mt-12 overflow-hidden rounded-[2.5rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] shadow-md">
              <Img
                value={block.image}
                alt={statement.slice(0, 100)}
                className="aspect-[16/9] w-full"
              />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
