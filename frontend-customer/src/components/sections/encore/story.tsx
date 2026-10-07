import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BOX, H2, Kicker, LABEL, RULE, Section, WRAP, str } from "./ui";

/** Liner notes: coach story set in two newspaper columns under a 3px rule, with halftone portrait and detail print. */
export function StoryLinerNotes({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section label={alt}>
      <div className={cn(WRAP, RULE, "pt-5")}>
        <div className="grid gap-y-12 md:grid-cols-12 md:gap-x-10">
          <div className="order-last md:order-first md:col-span-5">
            <div className={cn(BOX, "encore-halftone relative p-2")}>
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[4/5] w-full"
              />
            </div>
            {showSetting && (
              <div className={cn(BOX, "mt-4 w-[40%] p-1.5")}>
                <Img
                  value={block.image2}
                  alt={alt}
                  className="aspect-square w-full"
                />
              </div>
            )}
          </div>

          <div className="md:col-span-7">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-4 block max-w-[14ch]")}
            />
            <Rich
              block={block}
              field="body"
              editable={editable}
              className="mt-8 columns-1 text-[0.95rem] leading-[1.7] md:columns-2 md:gap-10 [&_p]:mb-4 [&_p]:break-inside-avoid"
            />
            {has(block, "signature", editable) && (
              <p className={cn(LABEL, "mt-8")}>
                <span aria-hidden="true" className="text-muted-foreground">
                  Produced by{" "}
                </span>
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
                className="encore-link group mt-8 inline-flex items-center gap-2 text-[0.95rem] font-semibold"
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
      </div>
    </Section>
  );
}
