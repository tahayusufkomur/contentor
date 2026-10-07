import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { BTN_ON_BLACK, Kicker, Section, WRAP, str } from "./ui";

/** The introduction: an invitation set on the black band with an outlined button. */
export function CtaIntroduction({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="black" label={alt}>
      <div className={WRAP}>
        <div className="mx-auto flex max-w-[44rem] flex-col items-center text-center">
          {showImage && (
            <div className="mb-14 aspect-[16/9] w-full max-w-[36rem] border border-[var(--inverse-foreground)] p-2.5">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[16/9] w-full"
              />
            </div>
          )}
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className="maison-opsz mt-7 block max-w-[16ch] text-balance break-words font-display text-[clamp(2.2rem,1.4rem+3.2vw,5rem)] font-normal leading-[1.0]"
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-7 block max-w-[40ch] text-pretty font-light text-[1.02rem] leading-[1.8] text-muted-foreground"
          />
          {has(block, "ctaLabel", editable) && (
            <div className="mt-11">
              <SmartLink href={block.ctaHref} className={BTN_ON_BLACK}>
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              </SmartLink>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
