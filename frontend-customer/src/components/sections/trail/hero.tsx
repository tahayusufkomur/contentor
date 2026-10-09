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
  Stamp,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) => ({ "--trail-delay": `${ms}ms` }) as CSSProperties;

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

/** The overlook: the view from the trail fills the hero and the claim sits
 *  on a route card pinned low and left, stamp on its corner, so the photo
 *  stays the view. One photo; without one the pine shows through. */
export function HeroOverlook({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showMeta = has(block, "meta", editable);
  return (
    <Section
      tone="pine"
      className="relative flex min-h-[min(46rem,92svh)] items-end py-0 md:py-0 lg:py-0"
      label={alt}
    >
      <Img
        value={block.image}
        alt={alt}
        priority
        className="absolute inset-0 size-full"
      />
      <div aria-hidden="true" className="trail-scrim absolute inset-0" />
      <div className={cn(WRAP, "relative pb-10 pt-40 md:pb-14")}>
        <div
          className={cn(
            "trail-rise trail-contours relative max-w-[38rem] rounded-[var(--radius)] border-2 border-foreground bg-background p-7 text-foreground shadow-[8px_8px_0_0_var(--accent)] md:p-10",
          )}
          style={delay(0)}
        >
          <Stamp className="absolute -right-5 -top-9 bg-background sm:-right-9">
            Trail
            <br />
            head
          </Stamp>
          <Kicker block={block} editable={editable} className="!text-primary" />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(
              H1,
              "mt-4 block",
              alt.length <= 28
                ? "max-w-[10ch] text-[clamp(2.8rem,1.4rem+4.6vw,5.6rem)] leading-[0.98]"
                : "max-w-[16ch] text-[clamp(2.2rem,1.3rem+3.2vw,4rem)]",
            )}
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-5 block max-w-[42ch] text-pretty text-[1.05rem] leading-[1.6] text-muted-foreground"
          />
          {showMeta && (
            <p
              className={cn(
                LABEL,
                "mt-6 flex items-center gap-3 border-t-2 border-dashed border-foreground/40 pt-5 text-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full bg-accent"
              />
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
      </div>
    </Section>
  );
}

/** The trailhead: contour lines on stone, the pine kicker, the claim in the
 *  slab serif, the dek, and the small line as a route card with a stamp on
 *  it; the wide photograph across the right as the view from the start. */
export function HeroTrailhead({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);
  return (
    <Section className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-12 md:grid-cols-12 md:items-center md:gap-x-8 lg:gap-x-12",
        )}
      >
        <div className="md:col-span-6">
          <div className="trail-rise" style={delay(0)}>
            <Kicker block={block} editable={editable} />
          </div>
          <div className="trail-rise mt-5" style={delay(120)}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 28
                  ? "max-w-[11ch] text-[clamp(3.2rem,1.3rem+7.2vw,8rem)] leading-[0.96]"
                  : "max-w-[15ch]",
              )}
            />
          </div>
          <div className="trail-rise mt-7" style={delay(260)}>
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block max-w-[44ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground md:text-[1.2rem]"
            />
          </div>
          {showMeta && (
            <div
              className={cn(
                CARD,
                "trail-rise relative mt-8 inline-flex max-w-full items-center gap-4 py-4 pl-5 pr-24",
              )}
              style={delay(400)}
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full bg-accent"
              />
              <p className={cn(LABEL, "min-w-0 text-foreground")}>
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </p>
              <Stamp className="absolute right-0 -top-6 sm:-right-5 sm:-top-5">
                Trail
                <br />
                head
              </Stamp>
            </div>
          )}
          <Actions
            block={block}
            editable={editable}
            className="trail-rise mt-9"
          />
        </div>

        <figure
          className="trail-rise relative md:col-span-6"
          style={delay(300)}
        >
          <Img
            value={block.image}
            alt={alt}
            priority
            className="aspect-[4/5] w-full rounded-[var(--radius)] sm:aspect-[5/4] md:aspect-[4/5] lg:aspect-[5/4]"
          />
          {showDetail && (
            <Img
              value={block.image2}
              alt={alt}
              className="trail-postcard absolute -bottom-8 -left-4 aspect-square w-[36%] max-w-[11rem] rotate-[-4deg] sm:-left-8"
            />
          )}
        </figure>
      </div>
    </Section>
  );
}

/** Inner-page title: the kicker, a slab title and its dek, the small line
 *  as a mono route note, an optional photo postcard on the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      className="border-b-2 border-foreground pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
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
            className="mt-5 block max-w-[17ch] text-balance break-words font-display text-[clamp(2.4rem,1.5rem+3.7vw,5.3rem)] font-bold leading-[1.02] tracking-[-0.015em]"
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
            <p
              className={cn(
                LABEL,
                "mt-6 flex items-center gap-3 text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full bg-accent"
              />
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
              className="trail-postcard aspect-[4/5] w-full max-w-[11rem] rotate-[-2deg] lg:ml-auto"
            />
          </figure>
        )}
      </div>
    </Section>
  );
}
