import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, Section, WRAP, str } from "./ui";

/** A letter from the coach: portrait with a setting print laid under it, a
 *  60ch column opening on a rubricated drop cap, signed in italic. */
export function StoryLetter({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  return (
    <Section label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-14 md:grid-cols-12 md:gap-x-8 lg:gap-x-10",
        )}
      >
        <div className="relative md:col-span-5">
          <Img
            value={block.image}
            alt={alt}
            className="aspect-[4/5] w-full lg:w-[88%]"
          />
          {showSetting && (
            <Img
              value={block.image2}
              alt={alt}
              className="relative -mt-20 ml-auto aspect-[3/2] w-[64%] border-[6px] border-background sm:-mt-28"
            />
          )}
        </div>

        <div className="md:col-span-7 md:col-start-6 lg:col-span-6 lg:col-start-7 lg:pt-10">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-5 block max-w-[17ch]")}
          />
          <div className="mt-10 h-px w-16 bg-foreground" aria-hidden="true" />
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="journal-dropcap mt-10 max-w-[60ch] text-[1.0625rem] leading-[1.75] [&_p]:mb-5"
          />
          {has(block, "signature", editable) && (
            <Txt
              block={block}
              field="signature"
              editable={editable}
              as="p"
              placeholder="Your name"
              className="mt-10 block font-display text-[2rem] font-light italic leading-none tracking-[-0.01em]"
            />
          )}
          {has(block, "ctaLabel", editable) && (
            <SmartLink
              href={block.ctaHref}
              className="group mt-10 inline-flex items-center gap-3 text-[0.95rem] font-medium"
            >
              <span className="journal-link">
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Link text"
                />
              </span>
              <Arrow />
            </SmartLink>
          )}
        </div>
      </div>
    </Section>
  );
}
