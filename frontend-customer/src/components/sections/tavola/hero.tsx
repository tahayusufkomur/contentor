import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  CARD,
  H1,
  Kicker,
  LABEL,
  Section,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--tavola-delay": `${ms}ms` }) as CSSProperties;

function Actions({
  block,
  editable,
  className,
}: SectionProps & { className?: string }) {
  const primary = has(block, "ctaLabel", editable);
  const secondary = has(block, "secondaryLabel", editable);
  if (!primary && !secondary) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      {primary && (
        <SmartLink href={block.ctaHref} className={BTN}>
          <Txt
            block={block}
            field="ctaLabel"
            editable={editable}
            placeholder="Button text"
          />
          <Arrow />
        </SmartLink>
      )}
      {secondary && (
        <SmartLink href={block.secondaryHref} className={BTN_GHOST}>
          <Txt
            block={block}
            field="secondaryLabel"
            editable={editable}
            placeholder="Second button"
          />
        </SmartLink>
      )}
    </div>
  );
}

/** The awning: the olive kicker, the claim in the chunky serif, the dek and
 *  the tomato button on the left; on the right the portrait as a menu card
 *  (ink border, olive shadow) with the small line as its specials board and
 *  the detail print set under its corner. */
export function HeroMenu({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);
  return (
    <Section className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-14 md:grid-cols-12 md:items-center md:gap-x-8 lg:gap-x-12",
        )}
      >
        <div className="md:col-span-7">
          <div className="tavola-rise" style={delay(0)}>
            <Kicker block={block} editable={editable} />
          </div>
          <div className="tavola-rise mt-5" style={delay(120)}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 28
                  ? "max-w-[11ch] text-[clamp(3.2rem,1.3rem+7.2vw,8.2rem)] leading-[0.96]"
                  : "max-w-[15ch]",
              )}
            />
          </div>
          <div className="tavola-rise mt-7" style={delay(260)}>
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block max-w-[44ch] text-pretty text-[1.125rem] leading-[1.6] md:text-[1.2rem]"
            />
          </div>
          <Actions
            block={block}
            editable={editable}
            className="tavola-rise mt-9"
          />
        </div>

        <div className="relative md:col-span-5">
          <figure className="tavola-set relative" style={delay(350)}>
            <div className={cn(CARD, "overflow-hidden p-3 sm:p-4")}>
              {showMeta && (
                <p
                  className={cn(
                    LABEL,
                    "mb-3 border-b-2 border-dotted border-border pb-3 sm:mb-4 sm:pb-4",
                  )}
                >
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line"
                  />
                </p>
              )}
              <Img
                value={block.image}
                alt={alt}
                priority
                className="aspect-[4/5] w-full rounded-[calc(var(--radius)-2px)]"
              />
            </div>
          </figure>
          {showDetail && (
            <Img
              value={block.image2}
              alt={alt}
              className="tavola-photo tavola-rise absolute -bottom-8 -left-4 aspect-square w-[36%] max-w-[11rem] rotate-[-3deg] rounded-[var(--radius)] sm:-left-8"
            />
          )}
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: kicker, a chunky serif title and its dek, the small
 *  line as an olive label, an optional small card photo on the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      className="border-b-2 border-dotted border-border pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div
        className={cn(
          WRAP,
          "grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10",
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
            className="mt-5 block max-w-[17ch] text-balance break-words font-display text-[clamp(2.4rem,1.5rem+3.7vw,5.3rem)] font-normal leading-[1.02] tracking-[-0.01em]"
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-7 block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground"
          />
          {has(block, "meta", editable) && (
            <p className={cn(LABEL, "mt-6")}>
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
            </p>
          )}
          <Actions block={block} editable={editable} className="mt-9" />
        </div>
        {showImage && (
          <figure className="lg:col-span-3 lg:col-start-10">
            <Img
              value={block.image}
              alt={alt}
              priority
              className="tavola-photo aspect-[4/5] w-full max-w-[11rem] rounded-[var(--radius)] lg:ml-auto"
            />
          </figure>
        )}
      </div>
    </Section>
  );
}
