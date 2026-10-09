import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H1, Kicker, LABEL, PILL, Section, WRAP, str } from "./ui";

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

/** The cover: the kicker as an italic masthead on the left over a heavy
 *  rule with the small line flush right, one large photo (the detail print
 *  as a small round inset), and a ruled column of numbered coverlines: the
 *  claim, the dek, the way in. */
export function HeroCover({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const masthead = str(block.kicker);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="pt-10 md:pt-14 lg:pt-16" label={alt}>
      <div className={WRAP}>
        {(has(block, "kicker", editable) || has(block, "meta", editable)) && (
          <div
            className="journal-rise flex items-end justify-between gap-x-8 gap-y-3 border-b-2 border-foreground pb-3"
            style={delay(0)}
          >
            <Txt
              block={block}
              field="kicker"
              editable={editable}
              as="p"
              placeholder="Masthead"
              className={cn(
                "block font-display font-light italic",
                masthead.length <= 22
                  ? "text-[clamp(2.4rem,0.8rem+6.4vw,6.8rem)] leading-[0.9] tracking-[-0.02em]"
                  : "text-[clamp(1.5rem,0.9rem+2vw,2.6rem)] leading-[1.05]",
              )}
            />
            {has(block, "meta", editable) && (
              <p className="hidden text-right font-display text-[0.98rem] italic leading-snug text-muted-foreground sm:block">
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  placeholder="Small line"
                />
              </p>
            )}
          </div>
        )}
        <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-12">
          <figure className="relative md:col-span-8">
            <div className="journal-unveil" style={delay(120)}>
              <Img
                value={block.image}
                alt={alt}
                priority
                className="aspect-[4/5] w-full md:aspect-[1/1]"
              />
            </div>
            {showDetail && (
              <div className="journal-rise absolute -bottom-6 right-4 w-[26%] max-w-[11rem] overflow-hidden rounded-full border-[6px] border-background md:-right-8">
                <Img
                  value={block.image2}
                  alt={alt}
                  className="aspect-square w-full"
                />
              </div>
            )}
          </figure>
          <div
            className="journal-rise flex flex-col md:col-span-4 md:border-l md:border-border md:pl-8"
            style={delay(260)}
          >
            <p className={cn(LABEL, "text-muted-foreground")}>No. 1</p>
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                "mt-4 block",
                alt.length <= 28
                  ? "text-[clamp(2.2rem,1rem+3.6vw,4.4rem)] leading-[1]"
                  : "text-[clamp(1.8rem,1rem+2.4vw,3rem)] leading-[1.04]",
              )}
            />
            {has(block, "subhead", editable) && (
              <div className="mt-8 border-t border-border pt-6">
                <p className={cn(LABEL, "text-muted-foreground")}>No. 2</p>
                <Txt
                  block={block}
                  field="subhead"
                  editable={editable}
                  as="p"
                  placeholder="Subheadline"
                  className="mt-3 block text-pretty text-[1.05rem] leading-[1.6] text-muted-foreground md:text-[1.12rem]"
                />
              </div>
            )}
            <Actions
              block={block}
              editable={editable}
              className="mt-auto pt-10"
            />
          </div>
        </div>
      </div>
    </Section>
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
