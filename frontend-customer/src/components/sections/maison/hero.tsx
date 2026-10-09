import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  Caption,
  FRAME,
  H1,
  Kicker,
  LABEL,
  Section,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--maison-delay": `${ms}ms` }) as CSSProperties;

function Actions({
  block,
  editable,
  className,
}: SectionProps & { className?: string }) {
  const primary = has(block, "ctaLabel", editable);
  const secondary = has(block, "secondaryLabel", editable);
  if (!primary && !secondary) return null;
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", className)}
    >
      {primary && (
        <SmartLink href={block.ctaHref} className={BTN}>
          <Txt
            block={block}
            field="ctaLabel"
            editable={editable}
            placeholder="Button text"
          />
        </SmartLink>
      )}
      {secondary && (
        <SmartLink
          href={block.secondaryHref}
          className={cn(
            LABEL,
            "maison-link group inline-flex items-center gap-3",
          )}
        >
          <Txt
            block={block}
            field="secondaryLabel"
            editable={editable}
            placeholder="Second button"
          />
          <Arrow />
        </SmartLink>
      )}
    </div>
  );
}

/** The cover: the kicker as the masthead across the top between two hairlines,
 *  the portrait in its frame at the centre with the claim set low across it,
 *  the dek and the actions as the left coverlines, the detail print and the
 *  small line as the right ones. */
export function HeroCover({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const masthead = str(block.kicker);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showSide = showDetail || has(block, "meta", editable);
  return (
    <Section className="pt-8 md:pt-10 lg:pt-12" label={alt}>
      <div className={WRAP}>
        {has(block, "kicker", editable) && (
          <div
            className="maison-fade border-y border-foreground py-4 md:py-6"
            style={delay(0)}
          >
            <Txt
              block={block}
              field="kicker"
              editable={editable}
              as="p"
              placeholder="Masthead"
              className={cn(
                "maison-opsz block text-center font-display font-normal uppercase tracking-[0.04em]",
                masthead.length <= 18
                  ? "text-[clamp(2.6rem,0.6rem+10.4vw,10rem)] leading-[0.9]"
                  : "text-[clamp(1.4rem,0.8rem+2.4vw,3rem)] leading-[1.1]",
              )}
            />
          </div>
        )}
        <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-12 md:items-end">
          <div
            className="maison-fade order-2 md:order-1 md:col-span-3"
            style={delay(300)}
          >
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block text-pretty text-[1.05rem] font-light italic leading-[1.7] md:text-[1.1rem]"
            />
            <Actions block={block} editable={editable} className="mt-8" />
          </div>
          <figure
            className="maison-fade order-1 mx-auto w-full max-w-[26rem] md:order-2 md:col-span-6 md:max-w-none"
            style={delay(150)}
          >
            <div className={FRAME}>
              <div className="relative">
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full md:aspect-[5/6]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 to-transparent"
                />
                <Txt
                  block={block}
                  field="headline"
                  editable={editable}
                  as="h1"
                  placeholder="Headline"
                  className={cn(
                    "maison-opsz absolute inset-x-0 bottom-0 block p-5 text-center font-display font-normal tracking-[-0.01em] text-white md:p-8",
                    alt.length <= 26
                      ? "text-[clamp(2.4rem,1rem+4.8vw,5.6rem)] leading-[0.96]"
                      : "text-[clamp(1.9rem,1rem+2.8vw,3.6rem)] leading-[1]",
                  )}
                />
              </div>
            </div>
          </figure>
          {showSide && (
            <div
              className="maison-fade order-3 mx-auto w-[60%] max-w-[12rem] md:col-span-3 md:mx-0 md:w-full md:max-w-none"
              style={delay(450)}
            >
              {showDetail && (
                <div className={cn(FRAME, "p-1.5")}>
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="aspect-square w-full"
                  />
                </div>
              )}
              {has(block, "meta", editable) && (
                <Caption>
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line"
                  />
                </Caption>
              )}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** The lookbook opening: the tracked kicker, the claim in enormous Bodoni,
 *  the dek in light Jost and a hairline-outlined action on the left; on
 *  the right the portrait in a hairline frame with its caption, the detail
 *  print as a small second plate. */
export function HeroLookbook({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="pt-10 md:pt-14 lg:pt-16" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-14 md:grid-cols-12 md:items-center md:gap-x-10 lg:gap-x-16",
        )}
      >
        <div className="md:col-span-7">
          <div className="maison-fade" style={delay(500)}>
            <Kicker block={block} editable={editable} />
          </div>
          <div className="maison-fade mt-7" style={delay(650)}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 26
                  ? "max-w-[9ch] text-[clamp(3.6rem,1.2rem+9vw,10rem)] leading-[0.92]"
                  : "max-w-[14ch]",
              )}
            />
          </div>
          <div className="maison-fade mt-9" style={delay(850)}>
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block max-w-[40ch] text-pretty text-[1.05rem] font-light leading-[1.7] md:text-[1.1rem]"
            />
          </div>
          <Actions
            block={block}
            editable={editable}
            className="maison-fade mt-11"
          />
        </div>

        <figure
          className="maison-fade mx-auto w-full max-w-[24rem] md:col-span-5 md:max-w-none"
          style={delay(0)}
        >
          <div className={FRAME}>
            <Img
              value={block.image}
              alt={alt}
              priority
              className="aspect-[3/4] w-full"
            />
          </div>
          {has(block, "meta", editable) && (
            <Caption>
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
            </Caption>
          )}
          {showDetail && (
            <div className="mt-8 flex justify-end">
              <div className={cn(FRAME, "w-[34%] max-w-[9rem] p-1.5")}>
                <Img
                  value={block.image2}
                  alt={alt}
                  className="aspect-square w-full"
                />
              </div>
            </div>
          )}
        </figure>
      </div>
    </Section>
  );
}

/** Inner-page title: the kicker, a large Bodoni title and its dek on the
 *  left, an optional small framed plate on the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      className="border-b border-border pb-16 pt-10 md:pb-24 md:pt-14 lg:pb-28"
      label={alt}
    >
      <div
        className={cn(
          WRAP,
          "grid gap-y-12 lg:grid-cols-12 lg:items-center lg:gap-x-10",
        )}
      >
        <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Page title"
            className="maison-opsz mt-6 block max-w-[16ch] text-balance break-words font-display text-[clamp(2.6rem,1.4rem+4.6vw,6.2rem)] font-normal leading-[0.98] tracking-[-0.01em]"
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-8 block max-w-[46ch] text-pretty text-[1.05rem] font-light leading-[1.7] text-muted-foreground"
          />
          {has(block, "meta", editable) && (
            <p className={cn(LABEL, "mt-7 text-muted-foreground")}>
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
            </p>
          )}
          <Actions block={block} editable={editable} className="mt-10" />
        </div>
        {showImage && (
          <figure className="lg:col-span-3 lg:col-start-10">
            <div className={cn(FRAME, "max-w-[15rem] p-2 lg:ml-auto")}>
              <Img
                value={block.image}
                alt={alt}
                priority
                className="aspect-[3/4] w-full"
              />
            </div>
          </figure>
        )}
      </div>
    </Section>
  );
}
