import { Img, SmartLink, Txt, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { BTN_ON_CREAM, Kicker, Section, WRAP, str } from "./ui";

/** The lamp: the one daylight band on the dark page, calling the visitor in. */
export function CtaLamp({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="cream" label={alt}>
      <div className={WRAP}>
        <div className="mx-auto flex max-w-[44rem] flex-col items-center text-center">
          {showImage && (
            <Img
              value={block.image}
              alt={alt}
              className="mb-12 aspect-[16/9] w-full max-w-[40rem] rounded-[var(--radius)]"
            />
          )}
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className="nocturne-soft mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.2rem,1.5rem+2.8vw,4.3rem)] font-normal leading-[1.04]"
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[44ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
          />
          <div className="mt-9">
            <SmartLink href={block.ctaHref} className={BTN_ON_CREAM}>
              <Txt
                block={block}
                field="ctaLabel"
                editable={editable}
                placeholder="Button text"
              />
            </SmartLink>
          </div>
        </div>
      </div>
    </Section>
  );
}
