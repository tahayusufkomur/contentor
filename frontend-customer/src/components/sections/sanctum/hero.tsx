import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { heroPhotos } from "../collage";
import {
  BTN,
  BTN_GHOST,
  H1,
  Kicker,
  MoonPhases,
  Section,
  StarGlyph,
  WRAP,
  ZodiacRing,
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
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-4",
        className,
      )}
    >
      {primary && (
        <SmartLink href={block.ctaHref} className={BTN}>
          <Txt
            block={block}
            field="ctaLabel"
            editable={editable}
            placeholder="Button text"
          />
          <StarGlyph className="text-primary-foreground" />
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

/** The observatory: the same ceremonial centre line under a larger zodiac
 *  ring, but no arch: the photographs are three moons in a row on the
 *  horizon, the first one full and in the middle, the others waxing either
 *  side. One photo is one full moon; two are a pair. */
export function HeroObservatory({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const all = heroPhotos(block, editable).slice(0, 3);
  // The first photo is the full moon in the middle, the rest flank it.
  const moons =
    all.length === 3 ? [all[1], all[0], all[2]] : all.length === 2 ? all : all;
  const sizes =
    all.length === 3
      ? ["size-24 md:size-44", "size-40 md:size-72", "size-24 md:size-44"]
      : all.length === 2
        ? ["size-36 md:size-60", "size-36 md:size-60"]
        : ["size-52 md:size-80"];
  return (
    <Section
      tone="temple"
      className="relative pt-16 md:pt-24 lg:pt-28"
      label={alt}
    >
      <ZodiacRing
        size={860}
        className="left-1/2 top-4 -translate-x-1/2 opacity-30"
      />
      <div className={cn(WRAP, "relative z-10")}>
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <Kicker block={block} editable={editable} />
          <MoonPhases className="mt-4" />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(H1, "mt-6 max-w-[18ch]")}
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-6 max-w-[48ch] text-pretty text-[1.0625rem] leading-[1.75] text-muted-foreground md:text-[1.15rem]"
          />
          {has(block, "meta", editable) && (
            <div className="mt-6 inline-flex items-center gap-2 text-[0.85rem] uppercase tracking-[0.14em] text-primary">
              <StarGlyph className="size-3 text-primary" />
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
              <StarGlyph className="size-3 text-primary" />
            </div>
          )}
          <Actions block={block} editable={editable} className="mt-10" />
        </div>
        {moons.length > 0 && (
          <ul className="mt-16 flex items-end justify-center gap-4 md:mt-20 md:gap-10">
            {moons.map((value, n) => (
              <li
                key={n}
                className={cn(
                  "rounded-full border border-[color-mix(in_oklch,var(--primary)_50%,transparent)] p-1 shadow-2xl",
                  sizes[n],
                )}
              >
                <Img
                  value={value}
                  alt={alt}
                  priority={n === (all.length === 3 ? 1 : 0)}
                  className="sanctum-oval size-full rounded-full"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

/** The Oracle: The Temple of the Stars signature hero.
 *  Midnight celestial sphere with rotating zodiac ring, moon phases,
 *  gold hairline arch portrait, and quiet ceremonial symmetry. */
export function HeroOracle({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="temple"
      className="relative pt-16 md:pt-24 lg:pt-32"
      label={alt}
    >
      {/* Background Zodiac Ring */}
      <div className="absolute left-1/2 top-12 -translate-x-1/2 md:top-6">
        <ZodiacRing size={680} className="opacity-40" />
      </div>

      <div className={cn(WRAP, "relative z-10")}>
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <Kicker block={block} editable={editable} />
          <MoonPhases className="mt-4" />

          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(H1, "mt-6 max-w-[18ch]")}
          />

          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-6 max-w-[48ch] text-pretty text-[1.0625rem] leading-[1.75] text-muted-foreground md:text-[1.15rem]"
          />

          {has(block, "meta", editable) && (
            <div className="mt-6 inline-flex items-center gap-2 text-[0.85rem] uppercase tracking-[0.14em] text-primary">
              <StarGlyph className="size-3 text-primary" />
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
              <StarGlyph className="size-3 text-primary" />
            </div>
          )}

          <Actions block={block} editable={editable} className="mt-10" />
        </div>

        {showImage && (
          <div className="mx-auto mt-16 max-w-lg md:mt-20">
            <div className="relative mx-auto w-full max-w-[22rem] md:max-w-[26rem]">
              {/* Outer gold halo glow */}
              <div
                aria-hidden="true"
                className="absolute inset-0 -m-3 rounded-t-full border border-[color-mix(in_oklch,var(--primary)_25%,transparent)] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_20%,transparent),transparent_70%)]"
              />

              {/* Main arch photograph with gold border */}
              <figure className="relative overflow-hidden rounded-t-full border border-[color-mix(in_oklch,var(--primary)_50%,transparent)] p-1.5 shadow-2xl">
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className="sanctum-arch aspect-[4/5] w-full"
                />
              </figure>

              {/* Detail circular photo */}
              {showDetail && (
                <figure className="absolute -bottom-6 -right-4 size-28 overflow-hidden rounded-full border-2 border-primary bg-background p-1 shadow-xl md:-bottom-8 md:-right-8 md:size-36">
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="sanctum-oval size-full"
                  />
                </figure>
              )}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

/** Inner-page compact header: kicker, heading, subhead, actions, optional side arch photo. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="temple"
      className="border-b border-border pb-16 pt-12 md:pb-24 md:pt-16"
      label={alt}
    >
      <div className={WRAP}>
        <div className="grid items-center gap-y-10 lg:grid-cols-12 lg:gap-x-12">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <MoonPhases className="mt-3.5 justify-start" />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className={cn(H1, "mt-5 max-w-[16ch]")}
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[48ch] text-pretty text-[1.0625rem] leading-[1.7] text-muted-foreground"
            />
            {has(block, "meta", editable) && (
              <div className="mt-5 inline-flex items-center gap-2 text-[0.82rem] uppercase tracking-[0.14em] text-primary">
                <StarGlyph className="size-2.5" />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </div>
            )}
            <Actions
              block={block}
              editable={editable}
              className="mt-8 justify-start"
            />
          </div>

          {showImage && (
            <figure className="relative mx-auto w-full max-w-[14rem] overflow-hidden rounded-t-full border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] p-1 lg:col-span-4 lg:ml-auto">
              <Img
                value={block.image}
                alt={alt}
                priority
                className="sanctum-arch aspect-[4/5] w-full"
              />
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
