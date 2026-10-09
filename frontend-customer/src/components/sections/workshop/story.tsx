import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { makeStoryLetter } from "../story-layouts";
import {
  CARD,
  H2,
  HandArrow,
  Kicker,
  Polaroid,
  Section,
  WRAP,
  WashiTape,
  str,
} from "./ui";

/** Maker story: warm craft portrait with washi tape on the left, long story
 *  with a handwritten Caveat sign-off and link. */
export function StoryMaker({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="kraft" label={alt}>
      <div className={WRAP}>
        <div className="grid gap-y-12 md:grid-cols-12 md:items-center md:gap-x-10 lg:gap-x-14">
          {showImage && (
            <div className="order-last relative md:order-first md:col-span-5">
              <div className="relative mx-auto max-w-sm md:max-w-none">
                <Polaroid
                  image={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full lg:rotate-[-1.5deg]"
                  tapePosition="top-left"
                />
                {showSetting && (
                  <div className="relative -mt-12 ml-auto w-[65%] lg:rotate-[2deg]">
                    <figure className="workshop-polaroid relative rounded-sm p-2 pb-5 sm:p-3 sm:pb-7">
                      <WashiTape
                        tone="primary"
                        className="-top-2.5 right-4 rotate-[8deg]"
                      />
                      <Img
                        value={block.image2}
                        alt={alt}
                        className="aspect-[3/2] w-full rounded-[2px]"
                      />
                    </figure>
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className={
              showImage
                ? "md:col-span-7 lg:col-span-6 lg:col-start-7"
                : "md:col-span-10 lg:col-span-8 lg:col-start-3"
            }
          >
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-3 block max-w-[20ch]")}
            />
            <Rich
              block={block}
              field="body"
              editable={editable}
              className="mt-6 max-w-[56ch] text-[1.0625rem] leading-[1.8] text-muted-foreground [&_p]:mb-4"
            />
            {has(block, "signature", editable) && (
              <div className="mt-8 flex items-center gap-3">
                <span aria-hidden="true" className="h-px w-8 bg-border" />
                <p className="workshop-hand text-[1.5rem] font-bold leading-none text-accent rotate-[-1deg]">
                  <Txt
                    block={block}
                    field="signature"
                    editable={editable}
                    placeholder="Your signature (name)"
                  />
                </p>
              </div>
            )}
            {has(block, "ctaLabel", editable) && (
              <div className="mt-8">
                <SmartLink
                  href={block.ctaHref}
                  className="group workshop-link inline-flex items-center gap-2 font-bold text-[1.05rem] text-foreground"
                >
                  <Txt
                    block={block}
                    field="ctaLabel"
                    editable={editable}
                    placeholder="Link text"
                  />
                  <HandArrow />
                </SmartLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

/** A note card on the bench: no photo, one lined card of the maker's own
 *  words taped down, signed in Caveat. */
export const StoryNotecard = makeStoryLetter({
  Section: (p) => <Section tone="kraft" {...p} />,
  Frame: ({ className, children }) => (
    <div
      className={cn(
        CARD,
        "workshop-lined relative rotate-[-0.6deg] px-6 py-10 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.2)] md:px-14",
        className,
      )}
    >
      <WashiTape tone="primary" className="-top-3 left-1/2 -translate-x-1/2" />
      {children}
    </div>
  ),
  wrap: WRAP,
  h2: H2,
  Kicker,
  body: "text-[1.0625rem] leading-[1.8] text-muted-foreground [&_p]:mb-4",
  signature: "workshop-hand text-[1.5rem] font-bold leading-none text-accent",
  signatureMark: <span aria-hidden="true" className="h-px w-8 bg-border" />,
  link: "workshop-link text-[1.05rem] font-bold text-foreground",
  LinkIcon: HandArrow,
});
