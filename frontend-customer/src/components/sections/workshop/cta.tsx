import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  BTN_ON_INK,
  HandArrow,
  Kicker,
  Polaroid,
  Section,
  WRAP,
  str,
} from "./ui";

/** Indigo inverse CTA band with dashed stitched border and a Caveat note. */
export function CtaPickup({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const cardContent = (
    <div className="relative rounded-[var(--radius)] border-2 border-dashed border-[color-mix(in_oklch,var(--inverse-foreground)_35%,transparent)] p-8 sm:p-12 md:p-14">
      <Kicker
        block={block}
        editable={editable}
        className="[&_p]:text-[color:var(--inverse-foreground)]"
      />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className="mt-3 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.2rem,1.5rem+2.8vw,4.2rem)] font-bold leading-[1.04] text-[color:var(--inverse-foreground)]"
      />
      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
      />
      {has(block, "ctaLabel", editable) && (
        <div className="mt-8">
          <SmartLink href={block.ctaHref} className={BTN_ON_INK}>
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder="Button text"
            />
            <HandArrow />
          </SmartLink>
        </div>
      )}
    </div>
  );

  return (
    <Section tone="inverse" label={alt}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          {showImage ? (
            <>
              <div className="lg:col-span-5">
                <Polaroid
                  image={block.image}
                  alt={alt}
                  className="aspect-[16/10] w-full lg:rotate-[-2deg]"
                  tapePosition="top-center"
                />
              </div>
              <div className="lg:col-span-7">{cardContent}</div>
            </>
          ) : (
            <div className="lg:col-span-10 lg:col-start-2">{cardContent}</div>
          )}
        </div>
      </div>
    </Section>
  );
}
