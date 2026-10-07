import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  Caption,
  FRAME,
  H2,
  Kicker,
  LABEL,
  Section,
  WRAP,
  str,
} from "./ui";

/** The atelier: a framed portrait signed in caption type on the left, the story in light Jost on the right. */
export function StoryAtelier({ block, editable }: SectionProps) {
  const alt = str(block.heading);

  return (
    <Section label={alt}>
      <div
        className={cn(
          WRAP,
          "grid items-center gap-y-14 md:grid-cols-12 md:gap-x-12",
        )}
      >
        <figure className="order-last md:order-first md:col-span-5">
          <div className={cn(FRAME, "mx-auto w-full max-w-[22rem]")}>
            <Img
              value={block.image}
              alt={alt}
              className="aspect-[3/4] w-full"
            />
          </div>
          {has(block, "signature", editable) && (
            <Caption>
              <Txt
                block={block}
                field="signature"
                editable={editable}
                placeholder="Signature"
              />
            </Caption>
          )}
        </figure>

        <div className="md:col-span-6 md:col-start-7">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-6 max-w-[16ch]")}
          />
          <div className="mt-8 h-px w-10 bg-foreground" aria-hidden="true" />
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="mt-8 max-w-[40ch] text-[1.02rem] font-light leading-[1.85] [&_p]:mb-5"
          />
          {has(block, "ctaLabel", editable) && (
            <SmartLink
              href={block.ctaHref}
              className={cn(
                LABEL,
                "maison-link group mt-10 inline-flex items-center gap-3",
              )}
            >
              <Txt
                block={block}
                field="ctaLabel"
                editable={editable}
                placeholder="Link text"
              />
              <Arrow />
            </SmartLink>
          )}
        </div>
      </div>
    </Section>
  );
}
