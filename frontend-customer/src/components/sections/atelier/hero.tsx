import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  ARCH,
  ArchFrame,
  Arrow,
  BTN,
  BTN_GHOST,
  Diamond,
  H1,
  Kicker,
  Section,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--atelier-delay": `${ms}ms` }) as CSSProperties;

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
            placeholder="Book a session"
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
            placeholder="Learn more"
          />
        </SmartLink>
      )}
    </div>
  );
}

/** The signature atelier hero: blush paper, airy display headline in Cormorant,
 *  soft pill buttons, and an arch-cropped portrait with an offset champagne hairline. */
export function HeroPortrait({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);

  return (
    <Section className="pt-12 md:pt-16 lg:pt-24" label={alt}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-14 md:grid-cols-12 md:gap-x-10 lg:gap-x-14">
          <div className="md:col-span-7 lg:col-span-7">
            <div className="atelier-fade-up" style={delay(0)}>
              <Kicker block={block} editable={editable} />
            </div>
            <div className="atelier-fade-up mt-5" style={delay(150)}>
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="h1"
                placeholder="Headline"
                className={cn(
                  H1,
                  alt.length <= 28
                    ? "max-w-[12ch] text-[clamp(3rem,1.4rem+6.5vw,7.5rem)] leading-[0.98]"
                    : "max-w-[16ch]",
                )}
              />
            </div>
            <div className="atelier-fade-up mt-7" style={delay(300)}>
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.7] text-muted-foreground md:text-[1.18rem]"
              />
            </div>

            {showMeta && (
              <div
                className="atelier-fade-up mt-7 flex items-center gap-2.5 text-[0.88rem] text-muted-foreground"
                style={delay(420)}
              >
                <Diamond />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Studio location or format"
                />
              </div>
            )}

            <Actions
              block={block}
              editable={editable}
              className="atelier-fade-up mt-10"
            />
          </div>

          <div className="relative md:col-span-5 lg:col-span-4 lg:col-start-9">
            <ArchFrame className="mx-auto max-w-sm md:max-w-none">
              <Img
                value={block.image}
                alt={alt}
                priority
                className={cn(ARCH, "aspect-[3/4] w-full")}
              />
            </ArchFrame>
            {showDetail && (
              <div className="absolute -bottom-6 -left-4 w-[42%] max-w-[10rem] sm:-bottom-8 sm:-left-6">
                <div className="overflow-hidden rounded-full border-2 border-background shadow-md">
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="aspect-square w-full"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: kicker, Cormorant display title and dek, with an optional
 *  compact arch crop on the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);

  return (
    <Section
      className="border-b border-[color-mix(in_oklch,var(--border)_80%,transparent)] pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div className={WRAP}>
        <div className="grid items-center gap-y-10 lg:grid-cols-12 lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.4rem,1.4rem+3.8vw,5.2rem)] font-medium leading-[1.04] tracking-[-0.015em]"
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-6 block max-w-[48ch] text-pretty text-[1.125rem] leading-[1.7] text-muted-foreground"
            />
            {showMeta && (
              <div className="mt-6 flex items-center gap-2.5 text-[0.88rem] text-muted-foreground">
                <Diamond />
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </div>
            )}
            <Actions block={block} editable={editable} className="mt-9" />
          </div>

          {showImage && (
            <figure className="lg:col-span-3 lg:col-start-10">
              <ArchFrame className="mx-auto max-w-[12rem] lg:ml-auto">
                <Img
                  value={block.image}
                  alt={alt}
                  priority
                  className={cn(ARCH, "aspect-[3/4] w-full")}
                />
              </ArchFrame>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
