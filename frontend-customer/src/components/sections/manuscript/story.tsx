import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  DoubleRule,
  Fleuron,
  H2,
  Kicker,
  MEASURE,
  Section,
  WRAP,
  str,
} from "./ui";

/** Coach preface formatted as a literary opening: running head, Spectral heading,
 *  drop cap on the first paragraph, long-form reading measure, coach signature,
 *  and framed plate illustrations. */
export function StoryPreface({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  const prose = (
    <div className="min-w-0">
      <Rich
        block={block}
        field="body"
        editable={editable}
        className="manuscript-dropcap text-pretty text-[1.125rem] leading-[1.85] text-foreground [&_p+p]:mt-5"
      />

      {has(block, "signature", editable) && (
        <p className="mt-8 font-display italic text-[1.25rem] text-accent">
          <span aria-hidden="true">—&nbsp;</span>
          <Txt
            block={block}
            field="signature"
            editable={editable}
            placeholder="Your name"
          />
        </p>
      )}

      {has(block, "ctaLabel", editable) && (
        <div className="mt-8">
          <SmartLink
            href={block.ctaHref}
            className="group manuscript-link inline-flex items-center gap-2 text-[1rem] font-medium text-foreground"
          >
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
  );

  return (
    <Section tone="paper" label={alt || "Preface"}>
      <div className={WRAP}>
        {/* Section Header */}
        <div className="mx-auto mb-12 max-w-[42rem] text-center">
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-4 block")}
          />
          <div className="mt-5 flex justify-center">
            <Fleuron />
          </div>
        </div>

        {/* Content & Plates */}
        {showImage ? (
          <div className="grid gap-y-12 lg:grid-cols-12 lg:items-start lg:gap-x-12">
            <figure className="order-last lg:order-first lg:col-span-5">
              <div className="manuscript-plate">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>

              {showSetting && (
                <div className="mt-8">
                  <div className="manuscript-plate">
                    <Img
                      value={block.image2}
                      alt={alt}
                      className="aspect-[3/2] w-full"
                    />
                  </div>
                </div>
              )}
            </figure>

            <div className="lg:col-span-7">
              {prose}
              <DoubleRule className="mt-10" />
            </div>
          </div>
        ) : (
          <div className={MEASURE}>
            {prose}
            <DoubleRule className="mt-12" />
          </div>
        )}
      </div>
    </Section>
  );
}
