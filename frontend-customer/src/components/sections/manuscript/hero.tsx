import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  BTN_GHOST,
  DoubleRule,
  Fleuron,
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

/** The title page of a finely bound book: a double hairline frame,
 *  running head, massive Spectral title, fleuron divider, subhead,
 *  author imprint meta line, buttons, and an optional frontispiece plate. */
export function HeroTitlepage({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section tone="paper" className="pt-12 md:pt-16 lg:pt-20" label={alt}>
      <div className={WRAP}>
        {/* Titlepage Frame */}
        <div className="manuscript-frame mx-auto max-w-[52rem] bg-background p-7 text-center sm:p-12 md:p-16">
          <Kicker block={block} editable={editable} />

          <div className="mt-6">
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Headline"
              className={cn(
                H1,
                alt.length <= 26
                  ? "max-w-[13ch] text-[clamp(2.8rem,1.4rem+5.5vw,6rem)] leading-[1.02]"
                  : "max-w-[18ch]",
                "mx-auto block",
              )}
            />
          </div>

          <div className="my-6 flex justify-center">
            <Fleuron className="text-xl" />
          </div>

          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mx-auto block max-w-[40ch] text-pretty text-[1.125rem] leading-[1.75] text-muted-foreground md:text-[1.2rem]"
          />

          {has(block, "meta", editable) && (
            <p className="mt-6 font-display italic text-[1.05rem] text-accent">
              <span aria-hidden="true">—&nbsp;</span>
              <Txt
                block={block}
                field="meta"
                editable={editable}
                placeholder="Author / Location"
              />
              <span aria-hidden="true">&nbsp;—</span>
            </p>
          )}

          <DoubleRule className="mx-auto my-8 max-w-[14rem]" />

          <Actions block={block} editable={editable} className="mt-2" />
        </div>

        {/* Optional Frontispiece Plate */}
        {showImage && (
          <figure className="mx-auto mt-12 max-w-[48rem]">
            <div className="manuscript-plate">
              <Img
                value={block.image}
                alt={alt}
                priority
                className="aspect-[16/10] w-full sm:aspect-[21/10]"
              />
            </div>
            {showDetail && (
              <div className="manuscript-plate relative -mt-8 ml-auto mr-4 aspect-square w-36 sm:w-44">
                <Img value={block.image2} alt={alt} className="h-full w-full" />
              </div>
            )}
          </figure>
        )}
      </div>
    </Section>
  );
}

/** Inner-page header: clean, compact, literary running head, Spectral title,
 *  fleuron ornament, and dek. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section
      tone="surface"
      className="border-b border-border pb-14 pt-12 md:pb-20 md:pt-16 lg:pb-24"
      label={alt}
    >
      <div className={WRAP}>
        <div className="mx-auto max-w-[44rem] text-center">
          <Kicker block={block} editable={editable} />

          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(
              H1,
              "mx-auto mt-4 block max-w-[22ch] text-[clamp(2.2rem,1.3rem+3.4vw,4.2rem)] leading-[1.08]",
            )}
          />

          <div className="my-5 flex justify-center">
            <Fleuron />
          </div>

          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            placeholder="Subheadline"
            className="mx-auto block max-w-[42ch] text-pretty text-[1.1rem] leading-[1.75] text-muted-foreground"
          />

          {showImage && (
            <figure className="mx-auto mt-10 max-w-xs">
              <div className="manuscript-plate">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/3] w-full"
                />
              </div>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}
