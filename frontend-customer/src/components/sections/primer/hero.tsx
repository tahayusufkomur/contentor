import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  H1,
  Kicker,
  Page,
  Section,
  Tabs,
  WRAP,
  str,
} from "./ui";

const delay = (ms: number) =>
  ({ "--primer-delay": `${ms}ms` }) as CSSProperties;

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

/** The title page of the exercise book: ruled paper with the red margin,
 *  the unit label in Courier, the title written in large, the dek, the
 *  small line as a note in the margin's voice, and on the right the portrait
 *  taped in like a print with level tabs at the page edge. */
export function HeroTitlePage({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section tone="ruled" className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div className={WRAP}>
        <Page className="grid gap-y-12 md:grid-cols-12 md:gap-x-8 lg:gap-x-10">
          <div className="md:col-span-7 lg:col-span-7">
            <div className="primer-write" style={delay(0)}>
              <Kicker block={block} editable={editable} />
            </div>
            <div className="primer-write mt-6" style={delay(200)}>
              <Txt
                block={block}
                field="headline"
                editable={editable}
                as="h1"
                placeholder="Headline"
                className={cn(
                  H1,
                  alt.length <= 28
                    ? "max-w-[11ch] text-[clamp(3.2rem,1.3rem+7.4vw,8.5rem)] leading-[0.98]"
                    : "max-w-[15ch]",
                )}
              />
            </div>
            <div className="primer-write mt-8" style={delay(500)}>
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="block max-w-[44ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground md:text-[1.2rem]"
              />
            </div>
            {has(block, "meta", editable) && (
              <p
                className="primer-courier primer-write mt-7 text-[0.95rem] text-accent"
                style={delay(650)}
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
              className="primer-write mt-10"
            />
          </div>

          <div className="relative md:col-span-5 lg:col-span-4 lg:col-start-9">
            <Tabs
              items={["A1", "A2", "B1"]}
              className="absolute -right-5 top-2 z-10 md:-right-8"
            />
            <figure className="mr-10 md:mr-12">
              <Img
                value={block.image}
                alt={alt}
                priority
                className="primer-print aspect-[4/5] w-full rotate-[-1.5deg]"
              />
              {showDetail && (
                <Img
                  value={block.image2}
                  alt={alt}
                  className="primer-print relative -mt-10 ml-auto aspect-square w-[42%] rotate-[2deg]"
                />
              )}
            </figure>
          </div>
        </Page>
      </div>
    </Section>
  );
}

/** Inner-page title: ruled paper, the unit label, a large serif title with
 *  its dek, and an optional small print taped to the right. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      tone="ruled"
      className="border-b border-border pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div className={WRAP}>
        <Page className="grid gap-y-10 lg:grid-cols-12 lg:items-center lg:gap-x-10">
          <div className={showImage ? "lg:col-span-8" : "lg:col-span-10"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="mt-5 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.4rem,1.5rem+3.6vw,5.2rem)] font-semibold leading-[1.04] tracking-[-0.015em]"
            />
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="mt-7 block max-w-[46ch] text-pretty text-[1.125rem] leading-[1.65] text-muted-foreground"
            />
            {has(block, "meta", editable) && (
              <p className="primer-courier mt-6 text-[0.95rem] text-accent">
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
                className="primer-print aspect-[4/5] w-full max-w-[11rem] rotate-[-1.5deg] lg:ml-auto"
              />
            </figure>
          )}
        </Page>
      </div>
    </Section>
  );
}
