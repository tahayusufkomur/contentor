import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BTN_ON_NAVY, Fig, RunningHead, Section, WRAP, str } from "./ui";

/** The navy band: running head, light serif invitation, a form-like signature
 *  line, and a bone button. */
export function CtaSignature({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showCta = has(block, "ctaLabel", editable);

  const copy = (
    <div>
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(
          "block text-balance break-words font-display font-normal tracking-[-0.018em]",
          "text-[clamp(2.25rem,1.5rem+2.7vw,4.25rem)] leading-[1.04] max-w-[18ch]",
        )}
      />
      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className="mt-6 block max-w-[44ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
      />
      <div className="mt-10 flex flex-wrap items-end gap-8">
        {showCta && (
          <SmartLink href={block.ctaHref} className={BTN_ON_NAVY}>
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder="Button text"
            />
            <Arrow />
          </SmartLink>
        )}
      </div>
    </div>
  );

  return (
    <Section tone="navy" label={alt}>
      <div className={WRAP}>
        <RunningHead block={block} editable={editable} right="Signed" />
        {showImage ? (
          <div className="mt-12 grid items-center gap-y-12 lg:mt-16 lg:grid-cols-12 lg:gap-x-10">
            <figure className="lg:col-span-6">
              <Img
                value={block.image}
                alt={alt}
                className="ledger-frame aspect-[16/10] w-full"
              />
              <Fig>{str(block.kicker) || null}</Fig>
            </figure>
            <div className="lg:col-span-6 lg:col-start-7">{copy}</div>
          </div>
        ) : (
          <div className="mt-12 max-w-[48rem] lg:mt-16">{copy}</div>
        )}
      </div>
    </Section>
  );
}
