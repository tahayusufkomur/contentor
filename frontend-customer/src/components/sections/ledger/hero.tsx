import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  Fig,
  H1,
  LABEL,
  Section,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--ledger-delay": `${ms}ms` }) as CSSProperties;

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

/** The report's title page: a running head (kicker left, the small line
 *  right) between an ink rule and a hairline, the claim set large in the
 *  light serif, the dek and actions beneath, and the portrait on the right
 *  as a framed plate with its figure number. */
export function HeroStatement({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showMeta = has(block, "meta", editable);
  const showKicker = has(block, "kicker", editable);
  return (
    <Section className="pt-8 md:pt-10 lg:pt-12" label={alt}>
      <div className={WRAP}>
        <div className="relative">
          <div
            aria-hidden="true"
            className="ledger-draw absolute inset-x-0 top-0 h-px bg-foreground"
            style={delay(0)}
          />
          {(showKicker || showMeta) && (
            <div
              className={cn(
                LABEL,
                "ledger-rise flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-2.5",
              )}
              style={delay(250)}
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
                className="ledger-dim"
              />
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-y-12 md:mt-16 md:grid-cols-12 md:gap-x-8 lg:mt-20 lg:gap-x-10">
          <div className="flex flex-col md:col-span-7 lg:col-span-8">
            <div className="ledger-rise" style={delay(400)}>
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="h1"
                placeholder="Headline"
                className={cn(
                  H1,
                  alt.length <= 30
                    ? "max-w-[10ch] text-[clamp(3.4rem,1.3rem+8.2vw,9.5rem)] leading-[0.95]"
                    : "max-w-[14ch]",
                )}
              />
            </div>
            <div
              className="ledger-rise mt-auto grid gap-y-8 pt-10 md:pt-14 lg:grid-cols-8 lg:gap-x-10 lg:pt-16"
              style={delay(600)}
            >
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="block max-w-[42ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground lg:col-span-5"
              />
              <Actions
                block={block}
                editable={editable}
                className="lg:col-span-3 lg:self-end"
              />
            </div>
          </div>

          <figure
            className="ledger-rise md:col-span-5 lg:col-span-4"
            style={delay(500)}
          >
            <Img
              value={block.image}
              alt={alt}
              priority
              className="ledger-frame aspect-[4/5] w-full"
            />
            <Fig className="mt-6">{str(block.meta) || null}</Fig>
          </figure>
        </div>
      </div>
    </Section>
  );
}

/** Inner-page title: the running head, a large serif title with its dek, an
 *  optional small plate on the right numbered Fig. 1. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showMeta = has(block, "meta", editable);
  const showKicker = has(block, "kicker", editable);
  return (
    <Section
      className="border-b border-border pb-14 pt-8 md:pb-20 md:pt-10 lg:pb-24 lg:pt-12"
      label={alt}
    >
      <div className={WRAP}>
        {(showKicker || showMeta) && (
          <div
            className={cn(
              LABEL,
              "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border border-t border-t-foreground py-2.5",
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
              className="ledger-dim"
            />
          </div>
        )}
        <div className="mt-12 grid gap-y-10 md:mt-16 lg:grid-cols-12 lg:items-center lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="block max-w-[18ch] text-balance break-words font-display text-[clamp(2.6rem,1.5rem+4vw,5.6rem)] font-normal leading-[1.0] tracking-[-0.015em]"
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
            <figure className="lg:col-span-3 lg:col-start-10">
              <Img
                value={block.image}
                alt={alt}
                priority
                className="ledger-frame aspect-[4/5] w-full max-w-[11rem] lg:ml-auto"
              />
              <Fig className="max-w-[11rem] lg:ml-auto">
                {str(block.kicker) || null}
              </Fig>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
