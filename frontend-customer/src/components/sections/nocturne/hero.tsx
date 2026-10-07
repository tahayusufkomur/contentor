import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  ARCH,
  Arrow,
  BTN,
  BTN_GHOST,
  CHIP,
  H1,
  Halo,
  Kicker,
  Section,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--nocturne-delay": `${ms}ms` }) as CSSProperties;

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
        </SmartLink>
      )}
      {secondary && (
        <SmartLink
          href={block.secondaryHref}
          className={cn(BTN_GHOST, "group gap-3")}
        >
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

/** The lantern: everything centred under one warm glow — the lavender
 *  kicker, the soft serif claim, the dek, the small line as a chip, the
 *  amber button — and beneath it the portrait arched like a lit window, the
 *  detail print tucked against its corner. */
export function HeroLantern({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="overflow-hidden pt-14 md:pt-20 lg:pt-24" label={alt}>
      <Halo className="nocturne-dawn">
        <div className={cn(WRAP, "flex flex-col items-center text-center")}>
          <div className="nocturne-rise" style={delay(300)}>
            <Kicker block={block} editable={editable} />
          </div>
          <div className="nocturne-rise mt-5" style={delay(450)}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 28
                  ? "max-w-[12ch] text-[clamp(3.2rem,1.3rem+7.5vw,8.5rem)] leading-[0.98]"
                  : "max-w-[18ch]",
              )}
            />
          </div>
          <div className="nocturne-rise mt-7" style={delay(600)}>
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block max-w-[44ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground md:text-[1.2rem]"
            />
          </div>
          <Actions
            block={block}
            editable={editable}
            className="nocturne-rise mt-9 justify-center"
          />
          {has(block, "meta", editable) && (
            <p className={cn(CHIP, "nocturne-rise mt-7")} style={delay(700)}>
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
            </p>
          )}
          <figure
            className="nocturne-rise relative mt-14 w-full max-w-[22rem] md:mt-20 md:max-w-[26rem]"
            style={delay(850)}
          >
            <Img
              value={block.image}
              alt={alt}
              priority
              className={cn(ARCH, "aspect-[4/5] w-full")}
            />
            {showDetail && (
              <Img
                value={block.image2}
                alt={alt}
                className="absolute -bottom-6 -right-2 aspect-square w-[34%] overflow-hidden rounded-full border-[6px] border-background sm:-right-12"
              />
            )}
          </figure>
        </div>
      </Halo>
    </Section>
  );
}

/** Inner-page title: the kicker, a soft serif title and its dek on the
 *  left, an optional arched portrait on the right with its own small halo. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      className="overflow-hidden border-b border-border pb-14 pt-14 md:pb-20 md:pt-20 lg:pb-24"
      label={alt}
    >
      <div
        className={cn(
          WRAP,
          "grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-10",
        )}
      >
        <div className={showImage ? "lg:col-span-7" : "lg:col-span-9"}>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Page title"
            className="nocturne-soft mt-5 block max-w-[16ch] text-balance break-words font-display text-[clamp(2.5rem,1.5rem+3.9vw,5.4rem)] font-normal leading-[1.02] tracking-[-0.012em]"
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mt-7 block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground"
          />
          <Actions block={block} editable={editable} className="mt-9" />
        </div>
        {showImage && (
          <Halo className="lg:col-span-4 lg:col-start-9 [--nocturne-halo:0.7]">
            <figure className="mx-auto w-full max-w-[14rem] lg:ml-auto lg:max-w-[14rem]">
              <Img
                value={block.image}
                alt={alt}
                priority
                className={cn(ARCH, "aspect-[4/5] w-full")}
              />
            </figure>
          </Halo>
        )}
      </div>
    </Section>
  );
}
