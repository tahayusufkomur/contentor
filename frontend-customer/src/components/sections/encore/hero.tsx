import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { heroPhotos } from "../collage";
import {
  Arrow,
  BOX,
  BTN,
  BTN_ACCENT,
  H1,
  DISPLAY,
  LABEL,
  Section,
  Stars,
  WRAP,
  pad2,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--encore-delay": `${ms}ms` }) as CSSProperties;

function Actions({
  block,
  editable,
  className,
}: SectionProps & { className?: string }) {
  const primary = has(block, "ctaLabel", editable);
  const secondary = has(block, "secondaryLabel", editable);
  if (!primary && !secondary) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
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
        <SmartLink href={block.secondaryHref} className={BTN_ACCENT}>
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

/** The lineup: the billing line between two heavy rules, the headline at
 *  the width of the page in wide black caps, then up to three tracks as
 *  ruled boxes across the foot, the dek and the actions between. */
export function HeroLineup({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const photos = heroPhotos(block, editable).slice(0, 3);
  const showKicker = has(block, "kicker", editable);
  const showMeta = has(block, "meta", editable);
  return (
    <Section className="pt-8 md:pt-10 lg:pt-12" label={alt}>
      <div className={WRAP}>
        {(showKicker || showMeta) && (
          <div
            className={cn(
              LABEL,
              "encore-stamp flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y-[3px] border-foreground py-3",
            )}
            style={delay(0)}
          >
            <Txt
              block={block}
              field="kicker"
              editable={editable}
              as="span"
              placeholder="Kicker"
            />
            <span aria-hidden="true" className="hidden sm:inline">
              &#9733;
            </span>
            <Txt
              block={block}
              field="meta"
              editable={editable}
              as="span"
              placeholder="Small line"
              className="text-muted-foreground"
            />
          </div>
        )}
        <div className="encore-stamp mt-6 md:mt-8" style={delay(150)}>
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(
              DISPLAY,
              "block",
              alt.length <= 26
                ? "text-[clamp(2.8rem,0.4rem+11.6vw,13rem)] leading-[0.86]"
                : "text-[clamp(2.2rem,0.6rem+6.4vw,7.4rem)] leading-[0.92]",
            )}
          />
        </div>
        <div
          className="encore-stamp mt-7 grid items-end gap-x-10 gap-y-6 md:grid-cols-12"
          style={delay(320)}
        >
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="block max-w-[46ch] text-pretty text-[1rem] font-medium uppercase leading-[1.55] tracking-[0.04em] md:col-span-7 md:text-[1.05rem]"
          />
          <Actions
            block={block}
            editable={editable}
            className="md:col-span-5 md:col-start-8 md:justify-end"
          />
        </div>
        {photos.length > 0 && (
          <ul
            className={cn(
              "encore-stamp mt-9 grid gap-3 sm:gap-5",
              photos.length === 1
                ? "grid-cols-1"
                : photos.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-2 md:grid-cols-3",
            )}
            style={delay(450)}
          >
            {photos.map((value, n) => (
              <li
                key={n}
                className={cn(
                  photos.length === 3 && n === 2 && "col-span-2 md:col-span-1",
                )}
              >
                <div
                  className={cn(BOX, "encore-halftone relative p-1.5 sm:p-2")}
                >
                  <Img
                    value={value}
                    alt={alt}
                    priority={n === 0}
                    className={
                      photos.length === 1
                        ? "aspect-[16/7] w-full"
                        : "aspect-[4/3] w-full"
                    }
                  />
                </div>
                <p className={cn(LABEL, "mt-2 text-muted-foreground")}>
                  Track {pad2(n)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

/** The poster: a 3px-ruled box with the billing line across the top (kicker
 *  left, the small line right, a star between), the headline stamped in
 *  wide black caps, the dek as a tracked line, a row of stars, the actions.
 *  Beside it the portrait as the record sleeve — square-ruled, with the
 *  detail print as the 7-inch. */
export function HeroPoster({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showKicker = has(block, "kicker", editable);
  const showMeta = has(block, "meta", editable);
  return (
    <Section className="pt-8 md:pt-10 lg:pt-12" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-10 md:grid-cols-12 md:items-stretch md:gap-x-8 lg:gap-x-10",
        )}
      >
        <div
          className={cn(
            BOX,
            "flex flex-col p-5 sm:p-7 md:col-span-7 md:p-8 lg:col-span-8 lg:p-10",
          )}
        >
          {(showKicker || showMeta) && (
            <div
              className={cn(
                LABEL,
                "encore-stamp flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-[3px] border-foreground pb-4",
              )}
              style={delay(0)}
            >
              <Txt
                block={block}
                field="kicker"
                editable={editable}
                as="span"
                placeholder="Kicker"
              />
              <span aria-hidden="true" className="hidden sm:inline">
                &#9733;
              </span>
              <Txt
                block={block}
                field="meta"
                editable={editable}
                as="span"
                placeholder="Small line"
                className="text-muted-foreground"
              />
            </div>
          )}
          <div className="encore-stamp mt-8 md:mt-10" style={delay(150)}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 26
                  ? "max-w-[9ch] text-[clamp(2.8rem,1rem+7.6vw,8.6rem)] leading-[0.92]"
                  : "max-w-[14ch]",
              )}
            />
          </div>
          <div className="encore-stamp mt-7" style={delay(320)}>
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block max-w-[46ch] text-pretty text-[1rem] font-medium uppercase leading-[1.55] tracking-[0.04em] md:text-[1.05rem]"
            />
          </div>
          <Stars className="encore-stamp mt-8 justify-start" />
          <div className="encore-stamp mt-auto pt-8" style={delay(450)}>
            <Actions block={block} editable={editable} />
          </div>
        </div>

        <figure
          className="encore-stamp md:col-span-5 lg:col-span-4"
          style={delay(250)}
        >
          <div className={cn(BOX, "encore-halftone relative p-2 sm:p-3")}>
            <Img
              value={block.image}
              alt={alt}
              priority
              className="aspect-[4/5] w-full md:aspect-square lg:aspect-[4/5]"
            />
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <figcaption className={cn(LABEL, "text-muted-foreground")}>
              Side A
            </figcaption>
            {showDetail && (
              <Img
                value={block.image2}
                alt={alt}
                className={cn(BOX, "aspect-square w-20 rounded-full sm:w-24")}
                imgClassName="rounded-full"
              />
            )}
          </div>
        </figure>
      </div>
    </Section>
  );
}

/** Inner-page title: a 3px rule, the billing line, the title stamped in
 *  caps with its dek, an optional small sleeve on the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showKicker = has(block, "kicker", editable);
  const showMeta = has(block, "meta", editable);
  return (
    <Section
      className="border-b-[3px] border-foreground pb-14 pt-8 md:pb-20 md:pt-10 lg:pb-24"
      label={alt}
    >
      <div className={cn(WRAP, "border-t-[3px] border-foreground pt-5")}>
        {(showKicker || showMeta) && (
          <div
            className={cn(
              LABEL,
              "flex flex-wrap items-center justify-between gap-x-6 gap-y-2",
            )}
          >
            <Txt
              block={block}
              field="kicker"
              editable={editable}
              as="span"
              placeholder="Kicker"
            />
            <Txt
              block={block}
              field="meta"
              editable={editable}
              as="span"
              placeholder="Small line"
              className="text-muted-foreground"
            />
          </div>
        )}
        <div className="mt-10 grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="block max-w-[14ch] text-balance break-words font-display text-[clamp(2.2rem,1.2rem+4vw,5.4rem)] font-black uppercase leading-[0.95] tracking-[-0.03em]"
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-7 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.6] text-muted-foreground"
            />
            <Actions block={block} editable={editable} className="mt-9" />
          </div>
          {showImage && (
            <figure className="lg:col-span-3 lg:col-start-10">
              <div
                className={cn(
                  BOX,
                  "encore-halftone relative max-w-[11rem] p-2 lg:ml-auto",
                )}
              >
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-square w-full"
                />
              </div>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
