import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN_ON_INK,
  DISPLAY,
  Kicker,
  Section,
  Stars,
  WRAP,
  str,
} from "./ui";

/** CTA encore: the final invitation on a high-contrast ink band with star icons and an inverted button. */
export function CtaEncore({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="ink" label={alt}>
      <div className={WRAP}>
        <div className="mx-auto flex max-w-[52rem] flex-col items-center text-center">
          {showImage && (
            <div className="mb-12 w-full border-[3px] border-[var(--inverse-foreground)] p-2">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[16/9] w-full"
              />
            </div>
          )}
          <Stars className="text-accent" />
          <Kicker block={block} editable={editable} className="mt-6" />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              DISPLAY,
              "mt-5 block max-w-[12ch] text-[clamp(2.2rem,1.2rem+4.4vw,6rem)] leading-[0.95]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[44ch] text-pretty text-[1.02rem] leading-[1.6] text-muted-foreground"
          />
          {has(block, "ctaLabel", editable) && (
            <div className="mt-9">
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
      </div>
    </Section>
  );
}
