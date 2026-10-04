import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, DISPLAY, Kicker, LABEL, WRAP } from "./ui";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** B/W portrait cut over the coach's name set in giant outlined caps. */
export function StoryOutline({ block, editable }: SectionProps) {
  const heading = str(block.heading);
  const name = str(block.signature);
  const hasSetting = Boolean(imageUrl(block.image2));

  return (
    <section
      className={cn(
        "kinetic-paper relative overflow-hidden pb-20 md:pb-32",
        name ? "pt-12 md:pt-16" : "pt-20 md:pt-32",
      )}
    >
      {name && (
        <p
          aria-hidden="true"
          className={cn(
            DISPLAY,
            "kinetic-outline kinetic-drift whitespace-nowrap pl-5 text-[15.5vw] md:text-[clamp(5rem,19vw,19rem)] [--kinetic-stroke-w:1.5px] [text-wrap:nowrap] md:pl-8 md:[--kinetic-stroke-w:2px]",
          )}
        >
          {name}
        </p>
      )}

      <div
        className={cn(WRAP, "relative grid gap-12 lg:grid-cols-12 lg:gap-8")}
      >
        <div
          className={cn(
            "relative z-10 lg:col-span-5",
            name && "-mt-[3vw] md:-mt-[10vw]",
            hasSetting && "mb-16 sm:mb-20",
          )}
        >
          <div
            aria-hidden="true"
            className="absolute -bottom-3 -left-3 h-full w-full bg-accent md:-bottom-4 md:-left-4"
          />
          <Img
            value={block.image}
            alt={heading}
            className="relative aspect-[4/5] w-full"
            imgClassName="grayscale contrast-[1.15]"
          />
          {hasSetting && (
            <Img
              value={block.image2}
              alt=""
              className="absolute -bottom-16 right-0 aspect-[3/2] w-[58%] border-[6px] border-background sm:-bottom-20 lg:-right-14"
              imgClassName="grayscale contrast-[1.15]"
            />
          )}
        </div>

        <div className="lg:col-span-6 lg:col-start-7 lg:pt-6">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className={cn(
              DISPLAY,
              "mt-5 text-[clamp(2.5rem,1rem+3.6vw,4.75rem)]",
            )}
          />
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="mt-8 max-w-[60ch] text-[1.0625rem] leading-[1.65] text-[color:var(--k-dim)] md:text-lg"
          />
          {(has(block, "signature", editable) ||
            has(block, "ctaLabel", editable)) && (
            <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t-[3px] border-foreground pt-6">
              <Txt
                block={block}
                field="signature"
                editable={editable}
                as="p"
                className={cn(DISPLAY, "text-[2rem] text-primary")}
              />
              {has(block, "ctaLabel", editable) && (
                <SmartLink
                  href={str(block.ctaHref)}
                  className={cn(
                    LABEL,
                    "kinetic-focus-out group inline-flex items-center gap-3 text-[0.8rem]",
                  )}
                >
                  <Txt block={block} field="ctaLabel" editable={editable} />
                  <span className="grid size-10 place-items-center bg-foreground text-accent transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Arrow className="size-4" />
                  </span>
                </SmartLink>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
