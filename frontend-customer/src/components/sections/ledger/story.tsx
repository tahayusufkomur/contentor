import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, Fig, H2, LABEL, RunningHead, Section, WRAP, str } from "./ui";

/** A memorandum: running head, framed portrait with setting print beneath,
 *  header table with From and Re hairlines, and a ruled body. */
export function StoryMemo({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showSignature = has(block, "signature", editable);
  const showCta = has(block, "ctaLabel", editable);

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <RunningHead block={block} editable={editable} right="Memorandum" />

        <div className="mt-12 grid gap-y-12 md:mt-16 md:grid-cols-12 md:gap-x-8 lg:mt-20 lg:gap-x-10">
          <figure className="order-last md:order-first md:col-span-5">
            <Img
              value={block.image}
              alt={alt}
              className="ledger-frame aspect-[4/5] w-full"
            />
            {showSetting && (
              <Img
                value={block.image2}
                alt={alt}
                className="mt-6 aspect-[3/2] w-2/3"
              />
            )}
            <Fig className="mt-6">{str(block.signature) || alt}</Fig>
          </figure>

          <div className="md:col-span-7 md:col-start-6 lg:col-span-7 lg:col-start-6">
            <div className="border-b border-border">
              {showSignature && (
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-2.5">
                  <span className={cn(LABEL, "ledger-dim")}>From</span>
                  <Txt
                    block={block}
                    field="signature"
                    editable={editable}
                    placeholder="Your name"
                    className={LABEL}
                  />
                </div>
              )}
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-3">
                <span className={cn(LABEL, "ledger-dim")}>Re</span>
                <Txt
                  block={block}
                  field="heading"
                  editable={editable}
                  as="h2"
                  placeholder="Heading"
                  className={cn(
                    H2,
                    "block text-[1.6rem] leading-[1.15] md:text-[2.2rem]",
                  )}
                />
              </div>
            </div>

            <Rich
              block={block}
              field="body"
              editable={editable}
              className="mt-8 max-w-[60ch] text-[1.0625rem] leading-[1.75] [&_p]:mb-5"
            />

            {showCta && (
              <div className="mt-10">
                <SmartLink
                  href={block.ctaHref}
                  className="group inline-flex items-center gap-3 text-[0.95rem] font-medium"
                >
                  <span className="ledger-link">
                    <Txt
                      block={block}
                      field="ctaLabel"
                      editable={editable}
                      placeholder="Link text"
                    />
                  </span>
                  <Arrow />
                </SmartLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
