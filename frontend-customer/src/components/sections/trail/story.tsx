import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Coach field notes: portrait and setting postcards, pine signature with a dash, link with trail arrow. */
export function StoryFieldNotes({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section label={alt}>
      <div
        className={cn(
          WRAP,
          "grid items-center gap-y-12 md:grid-cols-12 md:gap-x-10",
        )}
      >
        <div className="order-last md:order-first relative md:col-span-5">
          <Img
            value={block.image}
            alt={alt}
            className="trail-postcard aspect-[4/5] w-full rotate-[-2deg]"
          />
          {showSetting && (
            <Img
              value={block.image2}
              alt={alt}
              className="trail-postcard relative -mt-10 ml-auto aspect-[3/2] w-[62%] rotate-[3deg]"
            />
          )}
        </div>

        <div className="md:col-span-7 lg:col-span-6 lg:col-start-7">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-4 block max-w-[18ch]")}
          />
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="mt-8 max-w-[58ch] text-[1.0625rem] leading-[1.75] [&_p]:mb-5"
          />
          {has(block, "signature", editable) && (
            <p className={cn(LABEL, "mt-8 text-primary")}>
              <span aria-hidden="true">— </span>
              <Txt
                block={block}
                field="signature"
                editable={editable}
                placeholder="Your name"
              />
            </p>
          )}
          {has(block, "ctaLabel", editable) && (
            <SmartLink
              href={block.ctaHref}
              className="trail-link group mt-8 inline-flex items-center gap-2 font-semibold"
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
