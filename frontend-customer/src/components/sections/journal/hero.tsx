import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H1, Kicker, PILL, Section, WRAP, str } from "./ui";

const delay = (ms: number) =>
  ({ "--journal-delay": `${ms}ms` }) as CSSProperties;

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
      className={cn("flex flex-wrap items-center gap-x-8 gap-y-5", className)}
    >
      {primary && (
        <SmartLink href={block.ctaHref} className={PILL}>
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
          className="journal-link text-[0.95rem] font-medium"
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

/** Opening spread: a light serif headline set big against a tall, uncropped
 *  portrait with a caption, and a detail print laid over its corner. */
export function HeroEditorial({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="pt-10 md:pt-14 lg:pt-16" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-12 md:grid-cols-12 md:gap-x-8 lg:gap-x-10",
        )}
      >
        <div className="flex flex-col md:col-span-7 md:pb-4 lg:pt-6">
          <div className="journal-rise" style={delay(0)}>
            <Kicker block={block} editable={editable} />
          </div>
          <div className="journal-rise mt-6 lg:mt-8" style={delay(90)}>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 28
                  ? "max-w-[9ch] text-[clamp(3.25rem,1.2rem+8vw,9.25rem)] leading-[0.98]"
                  : "max-w-[13ch]",
              )}
            />
          </div>
          <div
            className="journal-rise mt-auto pt-10 md:pt-14 lg:pt-16"
            style={delay(200)}
          >
            <Txt
              block={block}
              field="subhead"
              editable={editable}
              as="p"
              placeholder="Subheadline"
              className="block max-w-[40ch] text-pretty text-[1.125rem] leading-[1.6] text-muted-foreground md:text-[1.2rem]"
            />
            <Actions block={block} editable={editable} className="mt-9" />
          </div>
        </div>

        <figure className="self-start md:col-span-5">
          <div className="relative">
            <div className="journal-unveil" style={delay(120)}>
              <Img
                value={block.image}
                alt={alt}
                priority
                className="aspect-[4/5] w-full"
              />
            </div>
            {showDetail && (
              <div
                className="journal-rise absolute -bottom-10 -left-3 w-[38%] max-w-[13rem] border-[6px] border-background sm:-left-6 lg:-left-24 lg:bottom-12"
                style={delay(700)}
              >
                <Img
                  value={block.image2}
                  alt={alt}
                  className="aspect-square w-full"
                />
              </div>
            )}
          </div>
          {has(block, "meta", editable) && (
            <figcaption
              className={cn(
                "mt-4 flex justify-end text-right font-display text-[0.98rem] italic leading-snug text-muted-foreground",
                showDetail && "pl-[42%] md:pl-[30%] lg:pl-0",
              )}
            >
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Small line"
              />
            </figcaption>
          )}
        </figure>
      </div>
    </Section>
  );
}

/** Inner-page title band: kicker, a large serif title and its dek, with an
 *  optional small portrait set to the right like a column photo. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  return (
    <Section
      className="border-b border-border pb-14 pt-14 md:pb-20 md:pt-20 lg:pb-24 lg:pt-24"
      label={alt}
    >
      <div
        className={cn(
          WRAP,
          "grid items-end gap-y-10 lg:grid-cols-12 lg:gap-x-10",
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
            className="mt-5 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.6rem,1.6rem+3.9vw,5.4rem)] font-light leading-[1.03] tracking-[-0.02em]"
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
          <figure className="lg:col-span-4">
            <Img
              value={block.image}
              alt={alt}
              priority
              className="aspect-[4/5] w-full max-w-[17rem] sm:max-w-[19rem] lg:ml-auto"
            />
            {has(block, "meta", editable) && (
              <figcaption className="mt-3 max-w-[19rem] font-display text-[0.95rem] italic text-muted-foreground lg:ml-auto">
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </Section>
  );
}
