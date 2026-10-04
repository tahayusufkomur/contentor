import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { BTN, BtnBody, DISPLAY, Kicker, LABEL, Marquee, WRAP } from "./ui";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Full-bleed duotone poster: giant caps headline bottom-left, a volt ticker
 *  of the block's own kicker/meta underneath. */
export function HeroPoster({ block, editable }: SectionProps) {
  const headline = str(block.headline);
  const size =
    headline.length <= 24
      ? "text-[clamp(4rem,0.5rem+12.5vw,12.5rem)]"
      : headline.length <= 44
        ? "text-[clamp(3.6rem,0.75rem+9vw,10rem)]"
        : "text-[clamp(3.3rem,0.75rem+7.8vw,9.5rem)]";
  const ticker = [str(block.kicker), str(block.meta)].filter(Boolean);
  const tickerWords = ticker.length ? ticker : headline ? [headline] : [];
  const hasDetail = Boolean(imageUrl(block.image2));

  return (
    <section className="kinetic-ink relative isolate overflow-hidden">
      <div className="relative flex min-h-[min(calc(100svh-4.5rem),58rem)] flex-col justify-end">
        <Img
          value={block.image}
          alt={headline}
          priority
          className="absolute inset-0 -z-20 bg-[var(--inverse)]"
          imgClassName="grayscale contrast-[1.2] brightness-[0.8]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,var(--inverse)_4%,color-mix(in_oklch,var(--inverse)_70%,transparent)_38%,color-mix(in_oklch,var(--inverse)_10%,transparent)_75%)]"
        />

        <div className={cn(WRAP, "pb-10 pt-32 md:pb-12")}>
          <Kicker block={block} editable={editable} />
          <div className="mt-5 flex items-end justify-between gap-10">
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              className={cn(
                DISPLAY,
                size,
                "kinetic-rise max-w-[16ch] text-[color:var(--inverse-foreground)]",
              )}
            />
            {hasDetail && (
              <Img
                value={block.image2}
                alt=""
                className="kinetic-notch hidden aspect-square w-[clamp(10rem,15vw,15rem)] shrink-0 [--kinetic-notch:28px] lg:block"
                imgClassName="grayscale contrast-[1.15]"
              />
            )}
          </div>

          <div className="mt-10 grid gap-8 border-t-2 border-[color:var(--k-rule)] pt-7 lg:grid-cols-12 lg:items-end">
            <div className="space-y-4 lg:col-span-6">
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                className="max-w-[46ch] text-lg leading-[1.5] text-[color:var(--k-dim)] md:text-xl"
              />
              {has(block, "meta", editable) && (
                <Txt
                  block={block}
                  field="meta"
                  editable={editable}
                  as="p"
                  className={cn(LABEL, "text-accent [line-height:1.5]")}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-6 lg:justify-end">
              {has(block, "ctaLabel", editable) && (
                <SmartLink
                  href={str(block.ctaHref)}
                  className={cn(BTN, "max-sm:w-full")}
                >
                  <BtnBody>
                    <Txt block={block} field="ctaLabel" editable={editable} />
                  </BtnBody>
                </SmartLink>
              )}
              {has(block, "secondaryLabel", editable) && (
                <SmartLink
                  href={str(block.secondaryHref)}
                  className={cn(
                    LABEL,
                    "kinetic-focus inline-flex h-14 items-center border-2 max-sm:w-full border-[color:var(--inverse-foreground)] px-6 text-[0.8rem] transition-colors hover:bg-[var(--inverse-foreground)] hover:text-[color:var(--inverse)]",
                  )}
                >
                  <Txt
                    block={block}
                    field="secondaryLabel"
                    editable={editable}
                  />
                </SmartLink>
              )}
            </div>
          </div>
        </div>
      </div>

      {tickerWords.length > 0 && (
        <Marquee
          className="bg-accent py-3.5 text-accent-foreground md:py-4"
          speed="38s"
          items={Array.from({ length: 4 }, (_, r) =>
            tickerWords.map((w, i) => (
              <span
                key={`${r}-${i}`}
                className={cn(
                  DISPLAY,
                  "flex items-center text-[clamp(1.6rem,1rem+1.6vw,2.5rem)] [line-height:1] [text-wrap:nowrap]",
                )}
              >
                <span className="px-6">{w}</span>
                <span
                  aria-hidden="true"
                  className="size-3 rotate-45 bg-foreground"
                />
              </span>
            )),
          ).flat()}
        />
      )}
    </section>
  );
}

/** Compact title band for inner pages. */
export function HeroIntro({ block, editable }: SectionProps) {
  const headline = str(block.headline);
  const withImage = Boolean(imageUrl(block.image));
  return (
    <section className="kinetic-ink relative isolate overflow-hidden">
      {withImage && (
        <div
          className="absolute inset-y-0 right-0 -z-10 hidden w-[40%] bg-primary md:block"
          style={{ clipPath: "polygon(22% 0, 100% 0, 100% 100%, 0 100%)" }}
        >
          <Img
            value={block.image}
            alt={headline}
            className="absolute inset-0 bg-primary"
            imgClassName="grayscale contrast-[1.25] mix-blend-multiply"
          />
        </div>
      )}
      <div className={cn(WRAP, "pb-14 pt-20 md:pb-20 md:pt-28")}>
        <div className={cn(withImage && "md:max-w-[58%]")}>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            className={cn(
              DISPLAY,
              "kinetic-rise mt-5 text-[clamp(3rem,1rem+6vw,7.5rem)]",
            )}
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            className="mt-6 max-w-[52ch] text-lg leading-[1.5] text-[color:var(--k-dim)]"
          />
        </div>
      </div>
      <div aria-hidden="true" className="h-2.5 bg-accent" />
    </section>
  );
}
