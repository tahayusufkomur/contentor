import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  Dot,
  H1,
  LABEL,
  LINK,
  Section,
  WRAP,
  WallLabel,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--darkroom-delay": `${ms}ms` }) as CSSProperties;

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
      className={cn("flex flex-wrap items-center gap-x-7 gap-y-4", className)}
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
        <SmartLink href={block.secondaryHref} className={cn(LINK, "group")}>
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

/** The exhibition: one enormous plate hung on the wall, and beside it,
 *  bottom-aligned, the label — kicker as the room line, the headline as the
 *  title, the dek as the work's description, the small line as a fact with a
 *  red dot. The detail print hangs small under the label. */
export function HeroExhibition({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="pt-6 md:pt-8 lg:pt-10" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-10 md:grid-cols-12 md:items-end md:gap-x-8 lg:gap-x-12",
        )}
      >
        <figure
          className="darkroom-lights md:col-span-7 lg:col-span-8"
          style={delay(0)}
        >
          <Img
            value={block.image}
            alt={alt}
            priority
            className="aspect-[4/5] w-full md:aspect-[5/6] lg:aspect-[4/5] xl:aspect-[5/6]"
          />
        </figure>

        <div
          className="darkroom-hang md:col-span-5 lg:col-span-4"
          style={delay(700)}
        >
          <WallLabel className="max-w-none">
            <Txt
              block={block}
              field="kicker"
              editable={editable}
              as="p"
              placeholder="Kicker"
              className={cn(LABEL, "text-muted-foreground")}
            />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(H1, "mt-5 block max-w-[16ch]")}
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[40ch] text-pretty text-[1.02rem] leading-[1.6] text-muted-foreground"
            />
            {has(block, "meta", editable) && (
              <p className={cn(LABEL, "mt-6 flex items-center gap-2.5")}>
                <Dot />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </p>
            )}
            <Actions block={block} editable={editable} className="mt-8" />
          </WallLabel>
          {showDetail && (
            <figure className="mt-10 flex items-end gap-4">
              <Img
                value={block.image2}
                alt={alt}
                className="aspect-square w-24 lg:w-28"
              />
              <figcaption
                className={cn(LABEL, "darkroom-tnum text-muted-foreground")}
              >
                Detail
              </figcaption>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: a wall label set large — kicker line, the title in
 *  Syne, the dek — and an optional small plate hung to the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      className="border-b border-border pb-14 pt-6 md:pb-20 md:pt-8 lg:pb-24 lg:pt-10"
      label={alt}
    >
      <div
        className={cn(
          WRAP,
          "grid gap-y-10 border-t border-foreground pt-4 lg:grid-cols-12 lg:items-center lg:gap-x-10",
        )}
      >
        <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
          <Txt
            block={block}
            field="kicker"
            editable={editable}
            as="p"
            placeholder="Kicker"
            className={cn(LABEL, "text-muted-foreground")}
          />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Page title"
            className="mt-5 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.2rem,1.3rem+3.2vw,4.6rem)] font-bold leading-[1.0] tracking-[-0.025em]"
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.6] text-muted-foreground"
          />
          {has(block, "meta", editable) && (
            <p className={cn(LABEL, "mt-6 flex items-center gap-2.5")}>
              <Dot />
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
            </p>
          )}
          <Actions block={block} editable={editable} className="mt-8" />
        </div>
        {showImage && (
          <figure className="lg:col-span-3 lg:col-start-10">
            <Img
              value={block.image}
              alt={alt}
              priority
              className="aspect-[4/5] w-full max-w-[11rem] lg:ml-auto"
            />
          </figure>
        )}
      </div>
    </Section>
  );
}
