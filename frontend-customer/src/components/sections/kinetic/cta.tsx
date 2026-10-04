import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { BtnBody, DISPLAY, Kicker, WRAP } from "./ui";

/** Full-width signal-red band, giant caps and a square-arrow button. */
export function CtaBand({ block, editable }: SectionProps) {
  const withImage = Boolean(imageUrl(block.image));
  const heading = typeof block.heading === "string" ? block.heading : "";
  return (
    <section className="kinetic-signal relative isolate">
      <div aria-hidden="true" className="kinetic-wedge" />
      {withImage && (
        <div className="absolute inset-y-0 right-0 -z-10 w-full overflow-hidden bg-primary lg:w-[48%]">
          <Img
            value={block.image}
            alt=""
            className="absolute inset-0 bg-primary"
            imgClassName="grayscale contrast-[1.3] mix-blend-multiply opacity-60 lg:opacity-100"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 hidden bg-[linear-gradient(to_right,var(--primary),transparent_45%)] lg:block"
          />
        </div>
      )}
      <div className={cn(WRAP, "py-20 md:py-32")}>
        <div className={cn(withImage && "lg:max-w-[62%]")}>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className={cn(
              DISPLAY,
              heading.length > 50
                ? "text-[clamp(2.75rem,1rem+5vw,7rem)]"
                : "text-[clamp(3.25rem,1rem+7.5vw,9.5rem)]",
              "mt-6 max-w-[18ch]",
            )}
          />
          <div className="mt-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between lg:justify-start lg:gap-14">
            <Txt
              block={block}
              field="text"
              editable={editable}
              as="p"
              className="max-w-[42ch] text-lg leading-[1.55] text-[color:var(--k-dim)]"
            />
            {has(block, "ctaLabel", editable) && (
              <SmartLink
                href={typeof block.ctaHref === "string" ? block.ctaHref : ""}
                className="kinetic-notch kinetic-focus inline-flex h-16 shrink-0 items-stretch self-start bg-foreground text-background transition-colors hover:bg-accent hover:text-accent-foreground sm:self-auto"
              >
                <BtnBody arrowClass="bg-accent text-accent-foreground w-16">
                  <Txt block={block} field="ctaLabel" editable={editable} />
                </BtnBody>
              </SmartLink>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
