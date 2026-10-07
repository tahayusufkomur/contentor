import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BTN_ON_BOARD, Kicker, Section, WRAP, str } from "./ui";

/** The reservation board: chalkboard invitation and cream button, with optional atmosphere photo. */
export function CtaReserve({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="board" label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-6">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[16/10] w-full rounded-[var(--radius)] border-2 border-[var(--inverse-foreground)]"
              />
            </div>
            <div className="lg:col-span-6 lg:pl-4">
              <Kicker block={block} editable={editable} />
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className="mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.2rem,1.5rem+2.8vw,4.3rem)] leading-[1.04]"
              />
              <Txt
                block={block}
                field="text"
                editable={editable}
                as="p"
                placeholder="Text"
                className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
              />
              {has(block, "ctaLabel", editable) && (
                <div className="mt-9">
                  <SmartLink href={block.ctaHref} className={BTN_ON_BOARD}>
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
        ) : (
          <div className="mx-auto flex max-w-[46rem] flex-col items-center text-center">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className="mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.2rem,1.5rem+2.8vw,4.3rem)] leading-[1.04]"
            />
            <Txt
              block={block}
              field="text"
              editable={editable}
              as="p"
              placeholder="Text"
              className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
            />
            {has(block, "ctaLabel", editable) && (
              <div className="mt-9">
                <SmartLink href={block.ctaHref} className={BTN_ON_BOARD}>
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
        )}
      </div>
    </Section>
  );
}
