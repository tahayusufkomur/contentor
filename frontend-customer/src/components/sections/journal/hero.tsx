import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H1, Kicker, PILL, Section, WRAP, str } from "./ui";
import { useTranslations } from "next-intl";

const delay = (ms: number) =>
  ({ "--journal-delay": `${ms}ms` }) as CSSProperties;

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
    <div
      className={cn("flex flex-wrap items-center gap-x-8 gap-y-5", className)}
    >
      {primary && (
        <SmartLink href={block.ctaHref} className={PILL}>
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
            className="journal-link text-[0.95rem] font-medium"
          >
            <Txt
              block={block}
              field="secondaryLabel"
              editable={editable}
              placeholder={t("placeholder.secondButton")}
            />
          </SmartLink>
        </div>
      )}
    </div>
  );
}

/** The cover: the kicker as an italic masthead on the left over a heavy
 *  rule with the small line flush right, one large photo (the detail print
 *  as a small round inset), and a ruled column of coverlines: the claim, the
 *  dek, the way in. */
export function HeroCover({ block, editable }: SectionProps) {
  const t = useTranslations("site");
  const alt = str(block.headline);
  const masthead = str(block.kicker);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section className="pt-4 sm:pt-6 md:pt-14 lg:pt-16" label={alt}>
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
              placeholder={t("placeholder.masthead")}
              className={cn(
                "block font-display font-light italic",
                masthead.length <= 22
                  ? "text-[clamp(2.4rem,0.8rem+6.4vw,6.8rem)] leading-[0.9] tracking-[-0.02em]"
                  : "text-[clamp(1.5rem,0.9rem+2vw,2.6rem)] leading-[1.05]",
              )}
            />
            {has(block, "meta", editable) && (
              <p
                className={cn(
                  "text-right font-display text-[0.98rem] italic leading-snug text-muted-foreground",
                  !editable && "hidden sm:block",
                )}
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
        )}
        <div className="mt-5 grid gap-x-10 gap-y-6 sm:mt-6 sm:gap-y-7 md:mt-8 md:grid-cols-12 md:gap-y-10">
          <figure className="relative md:col-span-7">
            <div className="journal-unveil" style={delay(120)}>
              <Img
                value={block.image}
                alt={alt}
                priority
                className="aspect-square w-full sm:aspect-[16/10] md:aspect-[6/5]"
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
            className="journal-rise flex flex-col md:col-span-5 md:border-l md:border-border md:pl-8"
            style={delay(260)}
          >
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder={t("placeholder.headline")}
              className={cn(
                H1,
                "block",
                alt.length <= 36
                  ? "text-[clamp(2.5rem,1rem+4.2vw,5rem)] leading-[1.02]"
                  : "text-[clamp(1.9rem,1rem+2.4vw,3.2rem)] leading-[1.04]",
              )}
            />
            {has(block, "subhead", editable) && (
              <div className="mt-4 border-t border-border pt-3 sm:mt-5 sm:pt-4 md:mt-8 md:pt-6">
                <Txt
                  block={block}
                  field="subhead"
                  editable={editable}
                  as="p"
                  placeholder={t("placeholder.subheadline")}
                  className="block text-pretty text-[1rem] leading-[1.55] text-muted-foreground sm:text-[1.05rem] sm:leading-[1.6] md:text-[1.12rem]"
                />
              </div>
            )}
            <Actions
              block={block}
              editable={editable}
              className="mt-auto pt-5 sm:pt-7 md:pt-10"
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
  const t = useTranslations("site");
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
              placeholder={t("placeholder.headline")}
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
              placeholder={t("placeholder.subheadline")}
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
                placeholder={t("placeholder.smallLine")}
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
  const t = useTranslations("site");
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
            placeholder={t("placeholder.pageTitle")}
            className="mt-5 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.6rem,1.6rem+3.9vw,5.4rem)] font-light leading-[1.03] tracking-[-0.02em]"
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
                  placeholder={t("placeholder.smallLine")}
                />
              </figcaption>
            )}
          </figure>
        )}
      </div>
    </Section>
  );
}
