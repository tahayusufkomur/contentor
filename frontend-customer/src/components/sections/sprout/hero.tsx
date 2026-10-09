import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { heroPhotos, tileStyle, TILE_W } from "../collage";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  BlobImage,
  H1,
  Kicker,
  Section,
  SproutDoodle,
  SquiggleDoodle,
  Sticker,
  SunDoodle,
  WRAP,
  str,
} from "./ui";

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

/** The mosaic: a friendly centred welcome over a cluster of up to four
 *  photos cut as blobs, a circle and a soft square, on a pale yellow cloud. */
export function HeroMosaic({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const photos = heroPhotos(block, editable);
  const shapes = [
    "sprout-blob-1 aspect-[4/5]",
    "rounded-full aspect-square",
    "sprout-blob-2 aspect-[4/5]",
    "rounded-[2.5rem] aspect-square",
  ];
  return (
    <Section tone="paper" className="pt-10 md:pt-16 lg:pt-20" label={alt}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute max-sm:hidden left-6 top-8 text-accent opacity-70 sprout-wiggle"
      >
        <SunDoodle className="size-12 md:size-16" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute max-sm:hidden right-8 top-12 text-primary opacity-40 sprout-float"
      >
        <SquiggleDoodle className="w-20 md:w-28" />
      </div>
      <div className={cn(WRAP, "text-center")}>
        <Kicker block={block} editable={editable} className="justify-center" />
        <Txt
          block={block}
          field="headline"
          editable={editable}
          as="h1"
          placeholder="Headline"
          className={cn(H1, "mx-auto mt-4 block max-w-[18ch] text-foreground")}
        />
        <Txt
          block={block}
          field="subhead"
          editable={editable}
          as="p"
          placeholder="Subheadline"
          className="mx-auto mt-6 block max-w-[50ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground md:text-[1.2rem]"
        />
        {has(block, "meta", editable) && (
          <div className="mt-6 flex items-center justify-center gap-2 text-[0.92rem] font-semibold text-primary">
            <SproutDoodle className="size-4" />
            <Txt
              block={block}
              field="meta"
              editable={editable}
              placeholder="Small line (e.g. format or ages)"
            />
          </div>
        )}
        <Actions
          block={block}
          editable={editable}
          className="mt-8 justify-center"
        />
        <div
          className={cn(
            "relative mx-auto mt-14 w-full max-w-[64rem]",
            photos.length > 0 && "aspect-[4/5] sm:aspect-[4/3] md:aspect-[5/2]",
          )}
        >
          {photos.length > 0 && (
            <div
              aria-hidden="true"
              className="sprout-blob-3 absolute inset-x-[8%] inset-y-[6%] bg-[color-mix(in_oklch,var(--accent)_30%,transparent)]"
            />
          )}
          {photos.map((value, n) => (
            <div
              key={n}
              className={cn("absolute", TILE_W, n > 1 && "max-sm:hidden")}
              style={{ ...tileStyle(photos.length, n), zIndex: 1 + (n % 2) }}
            >
              <Img
                value={value}
                alt={alt}
                priority={n === 0}
                className={cn(
                  shapes[n % 4],
                  "w-full border-[6px] border-background shadow-lg",
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** The signature hero: warm family room playground with organic photo blobs,
 *  playful hand-drawn doodles, and reassuring rounded typography. */
export function HeroPlayground({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showMain = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="paper" className="pt-10 md:pt-16 lg:pt-20" label={alt}>
      {/* Playful background doodles */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-6 top-8 text-accent opacity-70 sprout-wiggle"
      >
        <SunDoodle className="size-12 md:size-16" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-8 top-12 text-primary opacity-40 sprout-float"
      >
        <SquiggleDoodle className="w-20 md:w-28" />
      </div>

      <div className={WRAP}>
        <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          {/* Left Column: Copy & Actions */}
          <div
            className={
              showMain
                ? "lg:col-span-7"
                : "lg:col-span-8 lg:col-start-3 text-center"
            }
          >
            <Kicker
              block={block}
              editable={editable}
              className={!showMain ? "justify-center" : undefined}
            />

            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                "mt-4 block text-foreground",
                showMain ? "max-w-[16ch]" : "mx-auto max-w-[20ch]",
              )}
            />

            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className={cn(
                "mt-6 block text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground md:text-[1.2rem]",
                showMain ? "max-w-[44ch]" : "mx-auto max-w-[50ch]",
              )}
            />

            {has(block, "meta", editable) && (
              <div
                className={cn(
                  "mt-6 flex items-center gap-2 text-[0.92rem] font-semibold text-primary",
                  !showMain && "justify-center",
                )}
              >
                <SproutDoodle className="size-4" />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line (e.g. format or ages)"
                />
              </div>
            )}

            <Actions
              block={block}
              editable={editable}
              className={cn("mt-8", !showMain && "justify-center")}
            />
          </div>

          {/* Right Column: Organic Blob Mask Photos */}
          {showMain && (
            <div className="relative lg:col-span-5">
              <BlobImage
                value={block.image}
                alt={alt}
                variant={1}
                offsetColor="accent"
                priority
              />

              {/* Detail Photo sticker */}
              {showDetail && (
                <div className="absolute -bottom-6 -left-4 w-[42%] max-w-[10.5rem] md:-left-8">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-2 rotate-6 rounded-3xl bg-[color-mix(in_oklch,var(--primary)_25%,transparent)]"
                  />
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="relative aspect-square w-full rounded-3xl border-4 border-background shadow-lg rotate-3"
                  />
                </div>
              )}

              {/* Playful Sticker Badge */}
              <div className="absolute -right-2 top-4 hidden sm:block sprout-float-delayed">
                <Sticker rotate="8deg" className="border-2 border-background">
                  🌱
                </Sticker>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Inner-page header: compact and welcoming with friendly sentence-case title
 *  and optional small photo blob. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="paper"
      className="border-b border-[color-mix(in_oklch,var(--border)_70%,transparent)] pb-12 pt-10 md:pb-16 md:pt-14"
      label={alt}
    >
      <div className={WRAP}>
        <div className="grid items-center gap-y-8 lg:grid-cols-12 lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="mt-4 block max-w-[20ch] text-balance break-words font-display text-[clamp(2.2rem,1.4rem+3.2vw,4.4rem)] font-semibold leading-[1.1]"
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-4 block max-w-[46ch] text-pretty text-[1.1rem] leading-[1.65] text-muted-foreground"
            />
            {has(block, "meta", editable) && (
              <div className="mt-5 flex items-center gap-2 text-[0.9rem] font-semibold text-primary">
                <SproutDoodle className="size-4" />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </div>
            )}
            <Actions block={block} editable={editable} className="mt-8" />
          </div>

          {showImage && (
            <div className="lg:col-span-4 lg:flex lg:justify-end">
              <div className="relative w-full max-w-[14rem]">
                <div
                  aria-hidden="true"
                  className="sprout-blob-2 absolute -inset-2.5 rotate-6 bg-[color-mix(in_oklch,var(--accent)_50%,transparent)]"
                />
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="sprout-blob-2 relative aspect-square w-full shadow-md"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
