import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, Section, WRAP, str } from "./ui";

/** The trattoria kitchen table: portrait and detail print on the left, a warm
 *  story column signed by the coach and linked to the next step on the right. */
export function StoryKitchenTable({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showDetail = Boolean(imageUrl(block.image2)) || Boolean(editable);

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
            className="tavola-photo aspect-[4/5] w-full rounded-[var(--radius)]"
          />
          {showDetail && (
            <Img
              value={block.image2}
              alt={alt}
              className="tavola-photo relative -mt-10 ml-auto aspect-[3/2] w-[60%] rotate-[2deg] rounded-[var(--radius)]"
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
            <Txt
              block={block}
              field="signature"
              editable={editable}
              as="p"
              placeholder="Your name"
              className="mt-8 block font-display text-[1.6rem] leading-none text-primary"
            />
          )}
          {has(block, "ctaLabel", editable) && (
            <SmartLink
              href={block.ctaHref}
              className="tavola-link group mt-8 inline-flex items-center gap-2 font-bold"
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
