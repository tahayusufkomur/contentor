import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN_ON_INK,
  Enso,
  Kicker,
  LABEL,
  Seal,
  Section,
  WRAP,
  str,
} from "./ui";

/** Sumi ink call-to-action band with the red seal and Enso circle. */
export function CtaJoin({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const card = (
    <div className="relative border border-[var(--inverse-foreground)]/20 p-8 sm:p-12 lg:p-14">
      <div className="flex items-center justify-between border-b border-[var(--inverse-foreground)]/15 pb-4">
        <p className={cn(LABEL, "text-accent")}>Tatami Entry</p>
        <Seal text="道" className="size-8 text-sm" />
      </div>

      <Kicker block={block} editable={editable} className="mt-6" />

      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className="mt-4 block max-w-[20ch] text-balance break-words font-display text-[clamp(2.1rem,1.5rem+2.8vw,4.2rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-[color:var(--inverse-foreground)]"
      />

      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.68] text-muted-foreground"
      />

      {has(block, "ctaLabel", editable) && (
        <div className="mt-10">
          <SmartLink href={block.ctaHref} className={BTN_ON_INK}>
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder="Button text"
            />
            <Arrow />
          </SmartLink>
        </div>
      )}
    </div>
  );

  return (
    <Section tone="ink" label={alt || "Join the Dojo"}>
      <div className={cn(WRAP, "relative")}>
        <Enso className="left-1/2 -top-24 -translate-x-1/2 opacity-10" />
        <div className="relative z-10 grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          {showImage ? (
            <>
              <figure className="lg:col-span-5">
                <div className="dojo-photo border border-[var(--inverse-foreground)]/20 p-2.5">
                  <Img
                    value={block.image}
                    alt={alt}
                    className="aspect-[16/10] w-full"
                  />
                </div>
              </figure>
              <div className="lg:col-span-7">{card}</div>
            </>
          ) : (
            <div className="lg:col-span-10 lg:col-start-2">{card}</div>
          )}
        </div>
      </div>
    </Section>
  );
}
