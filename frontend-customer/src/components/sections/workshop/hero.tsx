import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { STAGE, heroPhotos, tileStyle, TILE_W } from "../collage";
import {
  BTN,
  BTN_GHOST,
  CARD,
  H1,
  HandArrow,
  Kicker,
  Polaroid,
  Section,
  WRAP,
  WashiTape,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--workshop-delay": `${ms}ms` }) as CSSProperties;

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
          <HandArrow />
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

/** The pinboard: up to four taped polaroids pinned over each other on the
 *  kraft bench, the headline written on a lined note card stuck across their
 *  feet. */
export function HeroPinboard({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const photos = heroPhotos(block, editable);
  const tapes = ["top-left", "top-center", "top-right", "top-center"] as const;
  return (
    <Section tone="kraft" className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div className={WRAP}>
        <div
          className={cn(
            "workshop-pin relative mx-auto grid w-full max-w-[70rem]",
            photos.length > 0 && STAGE,
          )}
        >
          {photos.map((value, n) => (
            <div
              key={n}
              className={cn("absolute", TILE_W, n > 0 && "max-sm:hidden")}
              style={{ ...tileStyle(photos.length, n), zIndex: 1 + (n % 2) }}
            >
              <Polaroid
                image={value}
                alt={alt}
                priority={n === 0}
                imgClassName={n % 2 ? "aspect-square" : "aspect-[4/5]"}
                tapePosition={tapes[n]}
              />
            </div>
          ))}
          <div
            className={cn(
              CARD,
              "workshop-lined relative z-10 max-w-[92%] rotate-[-1deg] justify-self-center px-6 py-5 text-center shadow-[0_10px_24px_-8px_rgba(0,0,0,0.25)] md:px-12 md:py-7",
              photos.length > 0 ? "self-end" : "self-center",
            )}
          >
            <WashiTape
              tone="primary"
              className="-top-3 left-1/2 -translate-x-1/2"
            />
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                "mt-2 block",
                alt.length > 28
                  ? "text-[clamp(1.9rem,1rem+3.2vw,3.8rem)]"
                  : "text-[clamp(2.4rem,1rem+5vw,6rem)] leading-[0.98]",
              )}
            />
          </div>
        </div>
        <div className="mx-auto mt-14 max-w-[46rem] text-center">
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="block text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground md:text-[1.2rem]"
          />
          {has(block, "meta", editable) && (
            <p className="workshop-hand mt-5 text-[1.15rem] font-bold text-accent">
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line (e.g. location or format)"
              />
            </p>
          )}
          <Actions
            block={block}
            editable={editable}
            className="mt-8 justify-center"
          />
        </div>
      </div>
    </Section>
  );
}

/** The Maker's Bench: kraft background, handwritten kicker, display headline,
 *  and polaroid prints held by washi tape on the bench. */
export function HeroBench({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="kraft" className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div className={WRAP}>
        <div className="grid gap-y-12 md:grid-cols-12 md:items-center md:gap-x-8 lg:gap-x-12">
          <div
            className={
              showImage
                ? "md:col-span-7 lg:col-span-7"
                : "md:col-span-10 lg:col-span-8"
            }
          >
            <div className="workshop-rise" style={delay(0)}>
              <Kicker block={block} editable={editable} />
            </div>

            <div className="workshop-rise mt-4" style={delay(150)}>
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="h1"
                placeholder="Headline"
                className={cn(
                  H1,
                  alt.length <= 28
                    ? "max-w-[12ch] text-[clamp(3.2rem,1.3rem+7.2vw,8.2rem)] leading-[0.98]"
                    : "max-w-[16ch]",
                )}
              />
            </div>

            <div className="workshop-rise mt-6" style={delay(300)}>
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground md:text-[1.2rem]"
              />
            </div>

            {has(block, "meta", editable) && (
              <div
                className="workshop-rise mt-6 flex items-center gap-2"
                style={delay(450)}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-primary"
                />
                <p className="workshop-hand text-[1.15rem] font-bold text-accent">
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line (e.g. location or format)"
                  />
                </p>
              </div>
            )}

            <Actions
              block={block}
              editable={editable}
              className="workshop-rise mt-9"
            />
          </div>

          {showImage && (
            <div className="relative md:col-span-5 lg:col-span-5">
              <div className="workshop-pin relative mx-auto max-w-sm md:max-w-none">
                <Polaroid
                  image={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full lg:rotate-[-1.5deg]"
                  tapePosition="top-center"
                />
                {showDetail && (
                  <div className="absolute -bottom-8 -right-3 w-[45%] max-w-[13rem] lg:rotate-[2.5deg] sm:-bottom-10 sm:-right-5">
                    <figure className="workshop-polaroid relative rounded-sm p-2 pb-5 sm:p-3 sm:pb-7">
                      <WashiTape
                        tone="primary"
                        className="-top-2.5 -right-2 rotate-[14deg]"
                      />
                      <Img
                        value={block.image2}
                        alt={alt}
                        className="aspect-square w-full rounded-[2px]"
                      />
                    </figure>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: compact header with handwritten kicker, display title,
 *  and an optional small polaroid print with washi tape on the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="kraft"
      className="border-b-2 border-dashed border-border pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div className={WRAP}>
        <div className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.4rem,1.5rem+3.6vw,5.2rem)] font-bold leading-[1.04] tracking-[-0.015em]"
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[48ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground"
            />
            {has(block, "meta", editable) && (
              <div className="mt-5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-primary"
                />
                <p className="workshop-hand text-[1.15rem] font-bold text-accent">
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line"
                  />
                </p>
              </div>
            )}
            <Actions block={block} editable={editable} className="mt-8" />
          </div>

          {showImage && (
            <div className="lg:col-span-4">
              <Polaroid
                image={block.image}
                alt={alt}
                priority
                className="mx-auto aspect-[4/5] w-full max-w-[13rem] lg:ml-auto lg:rotate-[-2deg]"
                tapePosition="top-left"
              />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
