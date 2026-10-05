import { cn } from "@/lib/utils";
import { Img, Rich, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, PopButton, PopSection, WRAP, str } from "./ui";

/** Lilac block: tilted portrait with the signature as a name sticker, an
 *  optional setting photo pinned over its corner, story on the right. */
export function StorySticker({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const withSetting = Boolean(imageUrl(block.image2));
  return (
    <PopSection bg="var(--card)" className="py-20 md:py-28">
      <div
        className={cn(
          WRAP,
          "grid items-center gap-x-16 gap-y-16 lg:grid-cols-12",
        )}
      >
        <div
          className={cn(
            "relative mx-auto w-full max-w-[24rem] pt-4 lg:col-span-5 lg:max-w-[30rem]",
            withSetting && "pb-16",
          )}
        >
          <div className="pop-card relative -rotate-2 overflow-hidden">
            <Img
              value={block.image}
              alt={alt}
              className="aspect-[4/5] w-full"
            />
          </div>
          {withSetting && (
            <div className="pop-card absolute -right-1 bottom-0 w-[58%] rotate-[4deg] overflow-hidden bg-[var(--pop-paper)] p-2 [--pop-r:1.25rem] sm:-right-6">
              <Img
                value={block.image2}
                alt=""
                className="aspect-[3/2] w-full rounded-[0.75rem]"
              />
            </div>
          )}
          {has(block, "signature", editable) && (
            <Txt
              block={block}
              field="signature"
              editable={editable}
              as="p"
              className="pop-sticker pop-wiggle pop-h3 absolute -top-1 left-3 bg-[var(--pop-pink)] px-5 py-2.5 text-xl [--pop-tilt:-7deg] md:text-2xl"
              placeholder="Your name"
            />
          )}
        </div>

        <div className="lg:col-span-7">
          <Kicker block={block} editable={editable} fill="sun" />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className="pop-display pop-h2 mt-6"
            placeholder="Heading"
          />
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="mt-8 max-w-[38rem]"
          />
          {has(block, "ctaLabel", editable) && (
            <div className="mt-9">
              <PopButton
                block={block}
                editable={editable}
                label="ctaLabel"
                href="ctaHref"
                tone="paper"
              />
            </div>
          )}
        </div>
      </div>
    </PopSection>
  );
}
