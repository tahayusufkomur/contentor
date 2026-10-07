import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, LABEL, LINK, Section, WRAP, str } from "./ui";

/** The artist statement: a large portrait on the left with an optional setting print, and a clean label column on the right. */
export function StoryStatement({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-14 border-t border-foreground pt-4 md:grid-cols-12 md:gap-x-8 lg:gap-x-10",
        )}
      >
        <div className="order-last md:order-first md:col-span-5">
          <Img value={block.image} alt={alt} className="aspect-[4/5] w-full" />
          {showSetting && (
            <Img
              value={block.image2}
              alt={alt}
              className="ml-auto mt-6 aspect-[3/2] w-2/3"
            />
          )}
        </div>

        <div className="md:col-span-6 md:col-start-7">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-3 block max-w-[18ch]")}
          />
          <div className="mt-8 h-px w-12 bg-foreground" aria-hidden="true" />
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="mt-8 max-w-[52ch] text-[1rem] leading-[1.75] text-foreground [&_p]:mb-5"
          />
          {has(block, "signature", editable) && (
            <Txt
              block={block}
              field="signature"
              editable={editable}
              as="p"
              placeholder="Your name"
              className={cn(LABEL, "mt-10 block text-foreground")}
            />
          )}
          {has(block, "ctaLabel", editable) && (
            <div className="mt-10">
              <SmartLink href={block.ctaHref} className={cn(LINK, "group")}>
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Link text"
                />
                <Arrow />
              </SmartLink>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
