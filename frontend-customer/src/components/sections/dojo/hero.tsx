import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { heroPhotos } from "../collage";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  Enso,
  H1,
  Kicker,
  LABEL,
  Section,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) => ({ "--dojo-delay": `${ms}ms` }) as CSSProperties;

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

/** The hall: everything on the centre line, the seal and kicker, the claim in
 *  black Mincho over a large ensō, the dek and the actions; then up to three
 *  training photos side by side as one horizontal band of thin-framed panels. */
export function HeroHall({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const photos = heroPhotos(block, editable).slice(0, 3);
  const showMeta = has(block, "meta", editable);
  return (
    <Section className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div className={cn(WRAP, "relative text-center")}>
        <div className="relative mx-auto max-w-[56rem]">
          <Enso className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          <div className="relative z-10">
            <div className="dojo-rise" style={delay(0)}>
              <Kicker
                block={block}
                editable={editable}
                className="justify-center"
              />
            </div>
            <div className="dojo-rise mt-5" style={delay(100)}>
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="h1"
                placeholder="Headline"
                className={cn(
                  H1,
                  "mx-auto block",
                  alt.length <= 26
                    ? "max-w-[14ch] text-[clamp(3rem,1.4rem+6.4vw,7.4rem)] leading-[0.98]"
                    : "max-w-[18ch] text-[clamp(2.4rem,1.2rem+3.8vw,5rem)] leading-[1.02]",
                )}
              />
            </div>
            <div className="dojo-rise mt-7" style={delay(220)}>
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="mx-auto block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.68] text-muted-foreground md:text-[1.2rem]"
              />
            </div>
            {showMeta && (
              <p
                className={cn(
                  LABEL,
                  "dojo-rise mt-6 text-[0.78rem] tracking-[0.12em] text-foreground",
                )}
                style={delay(320)}
              >
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </p>
            )}
            <Actions
              block={block}
              editable={editable}
              className="dojo-rise mt-10 justify-center"
            />
          </div>
        </div>
        {photos.length > 0 && (
          <ul
            className={cn(
              "dojo-rise mt-14 grid gap-3 text-left sm:gap-4 md:mt-20",
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
                  "dojo-photo border border-border bg-background p-2 shadow-sm",
                  photos.length === 3 && n === 2 && "col-span-2 md:col-span-1",
                )}
              >
                <Img
                  value={value}
                  alt={alt}
                  priority={n === 0}
                  className={
                    photos.length === 1
                      ? "aspect-[21/9] w-full"
                      : "aspect-[4/3] w-full"
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

/** Signature Dojo hero: rice paper background with Enso circle, disciplined
 *  high-contrast headlines, red seal, and sharp photographic portraits. */
export function HeroBanner({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);

  return (
    <Section className="pt-12 md:pt-16 lg:pt-24" label={alt}>
      <div className={cn(WRAP, "relative")}>
        <div className="grid gap-y-12 lg:grid-cols-12 lg:items-center lg:gap-x-12">
          <div className="relative lg:col-span-7">
            <Enso className="-left-14 -top-14 sm:-left-20 sm:-top-20" />
            <div className="relative z-10">
              <div className="dojo-rise" style={delay(0)}>
                <Kicker block={block} editable={editable} />
              </div>
              <div className="dojo-rise mt-5" style={delay(100)}>
                <Txt
                  block={block}
                  field="headline"
                  editable={editable}
                  as="h1"
                  placeholder="Headline"
                  className={cn(
                    H1,
                    alt.length <= 26
                      ? "max-w-[12ch] text-[clamp(3.1rem,1.4rem+7vw,8rem)] leading-[0.96]"
                      : "max-w-[15ch]",
                  )}
                />
              </div>
              <div className="dojo-rise mt-7" style={delay(220)}>
                <Txt
                  block={block}
                  field="subhead"
                  editable={editable}
                  as="p"
                  placeholder="Subheadline"
                  className="block max-w-[44ch] text-pretty text-[1.125rem] leading-[1.68] text-muted-foreground md:text-[1.2rem]"
                />
              </div>
              {showMeta && (
                <div
                  className="dojo-rise mt-6 flex items-center gap-3 border-l-2 border-accent pl-3.5"
                  style={delay(320)}
                >
                  <p
                    className={cn(
                      LABEL,
                      "text-[0.78rem] tracking-[0.12em] text-foreground",
                    )}
                  >
                    <Txt
                      block={block}
                      field="meta"
                      editable={editable}
                      placeholder="Small line"
                    />
                  </p>
                </div>
              )}
              <Actions
                block={block}
                editable={editable}
                className="dojo-rise mt-10"
              />
            </div>
          </div>

          <div className="relative lg:col-span-5">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="dojo-photo border border-border bg-background p-2.5 shadow-sm">
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full"
                />
              </div>
              {showDetail && (
                <div className="dojo-photo absolute -bottom-6 -left-4 w-[42%] max-w-[12rem] border-2 border-background bg-background p-2 shadow-md sm:-bottom-8 sm:-left-8">
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="aspect-square w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: kicker with red seal, bold Mincho title, dek, and
 *  an optional sharp print to the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);

  return (
    <Section
      className="border-b border-border pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div className={WRAP}>
        <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-12">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.4rem,1.5rem+3.8vw,5.4rem)] font-extrabold leading-[1.02] tracking-[-0.02em]"
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.68] text-muted-foreground"
            />
            {showMeta && (
              <div className="mt-6 flex items-center gap-3 border-l-2 border-accent pl-3.5">
                <p
                  className={cn(
                    LABEL,
                    "text-[0.78rem] tracking-[0.12em] text-foreground",
                  )}
                >
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line"
                  />
                </p>
              </div>
            )}
            <Actions block={block} editable={editable} className="mt-9" />
          </div>
          {showImage && (
            <figure className="lg:col-span-4">
              <div className="dojo-photo border border-border bg-background p-2 max-w-[13rem] lg:ml-auto">
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full"
                />
              </div>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
