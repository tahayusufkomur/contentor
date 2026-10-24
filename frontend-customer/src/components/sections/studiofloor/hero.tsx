import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  CHIP,
  H1,
  Kicker,
  Section,
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
        <SmartLink
          href={block.secondaryHref}
          className={cn(BTN_GHOST, !editable && "hidden sm:inline-flex")}
        >
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

/** The mirror wall: the whole studio fills the hero, dimmed to stage black,
 *  and the claim hangs on a frosted glass panel with a neon edge, low on the
 *  right like a cue card in the mirror, so her face stays clear above it.
 *  One photo; without one the stage lights carry it. On a phone the photo is
 *  a block of its own and the cue card hangs over only its lower edge. */
export function HeroMirror({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  return (
    <Section
      tone="stage"
      className="py-0 md:flex md:min-h-[min(46rem,92svh)] md:items-end md:py-0 lg:py-0"
      label={alt}
    >
      <div className="relative h-[25rem] md:absolute md:inset-0 md:h-auto">
        <Img
          value={block.image}
          alt={alt}
          priority
          className="absolute inset-0 size-full"
        />
        <div
          aria-hidden="true"
          className="studiofloor-mirror-wash absolute inset-0"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent md:hidden"
        />
      </div>
      <div aria-hidden="true" className="studiofloor-stage-beam" />
      <div
        className={cn(
          WRAP,
          "relative z-10 -mt-14 pb-10 md:mt-0 md:pb-16 md:pt-24",
        )}
      >
        <div className="ml-auto max-w-[34rem] rounded-[var(--radius)] border border-primary/50 bg-background/80 p-5 shadow-[0_0_48px_color-mix(in_oklch,var(--primary)_28%,transparent)] backdrop-blur-md sm:p-7 md:p-10 lg:max-w-[42rem]">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(
              H1,
              "mt-4 block",
              alt.length <= 36
                ? "text-[clamp(2.3rem,1.2rem+4.2vw,4.5rem)] leading-[0.92]"
                : "text-[clamp(2rem,1.2rem+2.8vw,3.4rem)] leading-[0.96]",
            )}
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-4 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground sm:mt-6"
          />
          {has(block, "meta", editable) && (
            <div className="mt-5">
              <span className={CHIP}>
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line (location / level)"
                />
              </span>
            </div>
          )}
          <Actions block={block} editable={editable} className="mt-6 sm:mt-8" />
        </div>
      </div>
    </Section>
  );
}

/** The signature stage entrance: stage lights overhead, stretched italic
 *  Anybody headline, and a mirror wall of photos separated by glowing neon
 *  light bars. */
export function HeroStage({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showMainImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showDetailImage = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const hasImages = showMainImage || showDetailImage;

  return (
    <Section tone="stage" className="pt-16 md:pt-24 lg:pt-28" label={alt}>
      {/* CSS-only stage lighting */}
      <div aria-hidden="true" className="studiofloor-stage-beam" />
      <div aria-hidden="true" className="studiofloor-spotlight-cone" />

      <div className={cn(WRAP, "relative z-10")}>
        <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          <div className={hasImages ? "lg:col-span-7" : "lg:col-span-9"}>
            <Kicker block={block} editable={editable} />

            <div className="mt-5">
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="h1"
                placeholder="Headline"
                className={cn(
                  H1,
                  alt.length <= 32
                    ? "text-[clamp(2.4rem,1.2rem+5.4vw,5.4rem)] leading-[0.90]"
                    : "text-[clamp(2.2rem,1.2rem+4vw,4.6rem)] leading-[0.94]",
                )}
              />
            </div>

            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-7 block max-w-[48ch] text-pretty text-[1.125rem] leading-[1.68] text-muted-foreground md:text-[1.2rem]"
            />

            {has(block, "meta", editable) && (
              <div className="mt-6 flex items-center gap-2">
                <span className={CHIP}>
                  <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line (location / level)"
                  />
                </span>
              </div>
            )}

            <Actions
              block={block}
              editable={editable}
              className="mt-10 md:mt-12"
            />
          </div>

          {hasImages && (
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-lg lg:max-w-none">
                {/* Mirror Wall Photo Array */}
                <div className="relative grid grid-cols-12 gap-3 md:gap-4">
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-[var(--radius)] border border-primary/40 shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_25%,transparent)]",
                      showDetailImage ? "col-span-8" : "col-span-12",
                    )}
                  >
                    <Img
                      value={block.image}
                      alt={alt}
                      priority
                      className="aspect-[3/4] w-full"
                    />
                    <div
                      aria-hidden="true"
                      className="studiofloor-lightbar absolute inset-0 pointer-events-none"
                    />
                  </div>

                  {showDetailImage && (
                    <div className="col-span-4 flex flex-col justify-end">
                      <div className="relative overflow-hidden rounded-[var(--radius)] border border-accent/40 shadow-[0_0_20px_color-mix(in_oklch,var(--accent)_25%,transparent)]">
                        <Img
                          value={block.image2}
                          alt={alt}
                          className="aspect-[3/4] w-full"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Inner-page header: compact dance studio header with bold Anybody
 *  headline, subhead, actions, and optional compact photo. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="stage"
      className="border-b border-border/80 pb-16 pt-14 md:pb-22 md:pt-18 lg:pb-24"
      label={alt}
    >
      <div aria-hidden="true" className="studiofloor-stage-beam opacity-60" />
      <div className={cn(WRAP, "relative z-10")}>
        <div className="grid items-center gap-y-10 lg:grid-cols-12 lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />

            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className={cn(
                H1,
                "mt-4 block max-w-[20ch] text-[clamp(2.1rem,1.2rem+3.2vw,4.2rem)] leading-[0.94]",
              )}
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
              <div className="mt-6 flex items-center gap-2">
                <span className={CHIP}>
                  <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder="Small line"
                  />
                </span>
              </div>
            )}

            <Actions block={block} editable={editable} className="mt-9" />
          </div>

          {showImage && (
            <div className="lg:col-span-4">
              <div className="relative mx-auto max-w-[16rem] overflow-hidden rounded-[var(--radius)] border border-primary/50 shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_25%,transparent)] lg:ml-auto">
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="aspect-[4/5] w-full"
                />
                <div
                  aria-hidden="true"
                  className="studiofloor-lightbar absolute inset-0 pointer-events-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
