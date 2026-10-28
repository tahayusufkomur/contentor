import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  FRAME,
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
import { useTranslations } from "next-intl";

const delay = (ms: number) =>
  ({ "--velvet-delay": `${ms}ms` }) as CSSProperties;

function Actions({
  block,
  editable,
  className,
}: SectionProps & { className?: string }) {
  const t = useTranslations("site");
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
            placeholder={t("placeholder.buttonText")}
          />
        </SmartLink>
      )}
      {secondary && (
        <div className={editable ? "contents" : "hidden sm:contents"}>
          <SmartLink
            href={block.secondaryHref}
            className={cn(BTN_GHOST, "group gap-3")}
          >
            <Txt
              block={block}
              field="secondaryLabel"
              editable={editable}
              placeholder={t("placeholder.secondButton")}
            />
            <Arrow />
          </SmartLink>
        </div>
      )}
    </div>
  );
}

/** The portrait: a tall photograph bleeds off the right edge and sinks into
 *  the room's colour on its left and at its foot; the italic claim, the dek
 *  and the satin button sit in that shadow, the headline allowed to drift
 *  over the faded edge. The detail print is a small framed card in the
 *  photograph's corner. */
export function HeroPortrait({ block, editable }: SectionProps) {
  const t = useTranslations("site");
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="overflow-hidden py-0 md:py-0 lg:py-0" label={alt}>
      <div>
        <div className="relative lg:min-h-[46rem]">
          <div className="relative lg:absolute lg:inset-y-0 lg:right-0 lg:w-[56%]">
            <Img
              value={block.image}
              alt={alt}
              priority
              className="velvet-veil bg-background h-[25rem] w-full sm:h-[30rem] lg:h-full"
            />
            {showDetail && (
              <Img
                value={block.image2}
                alt={alt}
                className={cn(
                  FRAME,
                  "absolute bottom-8 right-8 z-10 aspect-[3/4] w-[7.5rem] lg:bottom-12 lg:right-12 lg:w-[9rem]",
                  !editable && "hidden sm:block",
                )}
              />
            )}
          </div>
          <div
            className={cn(
              WRAP,
              "relative z-10 -mt-16 pb-16 sm:-mt-24 lg:mt-0 lg:flex lg:min-h-[46rem] lg:items-center lg:py-28",
            )}
          >
            <div className="lg:max-w-[62%]">
              <div className="velvet-rise" style={delay(300)}>
                <Kicker block={block} editable={editable} />
              </div>
              <div className="velvet-rise mt-5" style={delay(450)}>
                <Txt
                  block={block}
                  field="headline"
                  editable={editable}
                  as="h1"
                  placeholder={t("placeholder.headline")}
                  className={cn(
                    H1,
                    "max-w-[14ch] text-[clamp(3rem,1.3rem+4.9vw,6.4rem)] leading-[0.98]",
                    alt.length > 28 &&
                      alt.length <= 40 &&
                      "text-[2.6rem] leading-[1] sm:text-[clamp(3rem,1.3rem+4.9vw,6.4rem)] sm:leading-[0.98]",
                    alt.length > 40 &&
                      "text-[clamp(2.3rem,1.2rem+3.6vw,4.8rem)] leading-[1.04]",
                  )}
                />
              </div>
              <div className="velvet-rise mt-7" style={delay(600)}>
                <Txt
                  block={block}
                  field="subhead"
                  editable={editable}
                  as="p"
                  placeholder={t("placeholder.subheadline")}
                  className="block max-w-[42ch] text-pretty text-[1.1rem] leading-[1.7] text-muted-foreground md:text-[1.18rem]"
                />
              </div>
              <Actions
                block={block}
                editable={editable}
                className="velvet-rise mt-9"
              />
              {has(block, "meta", editable) && (
                <p
                  className={cn(
                    CHIP,
                    "velvet-rise mt-8 normal-case tracking-[0.04em]",
                  )}
                  style={delay(750)}
                >
                  <Txt
                    block={block}
                    field="meta"
                    editable={editable}
                    placeholder={t("placeholder.smallLine")}
                  />
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: the kicker, a soft serif title and its dek on the
 *  left, an optional arched portrait on the right with its own small halo. */
export function HeroIntro({ block, editable }: SectionProps) {
  const t = useTranslations("site");
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
            placeholder={t("placeholder.pageTitle")}
            className="velvet-it mt-5 block max-w-[16ch] text-balance break-words font-display text-[clamp(2.5rem,1.5rem+3.9vw,5.4rem)] font-normal leading-[1.02] tracking-[-0.012em]"
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder={t("placeholder.subheadline")}
            className="mt-7 block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground"
          />
          <Actions block={block} editable={editable} className="mt-9" />
        </div>
        {showImage && (
          <Halo className="lg:col-span-4 lg:col-start-9 [--velvet-halo:0.7]">
            <figure className="mx-auto w-full max-w-[14rem] lg:ml-auto lg:max-w-[14rem]">
              <Img
                value={block.image}
                alt={alt}
                priority
                className={cn(FRAME, "aspect-[4/5] w-full")}
              />
            </figure>
          </Halo>
        )}
      </div>
    </Section>
  );
}
