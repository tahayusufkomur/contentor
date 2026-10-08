import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN_ON_INVERSE,
  BlobImage,
  H2,
  Kicker,
  Section,
  StarDoodle,
  SunDoodle,
  WaveDivider,
  WRAP,
  str,
} from "./ui";

/** Call-to-action on an inverse band framed with an organic wave edge
 *  and big friendly round button. */
export function CtaJoin({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <div className="relative overflow-x-clip">
      {/* Top wave divider transition into inverse band */}
      <WaveDivider fill="var(--inverse)" className="-mb-1" />

      <Section
        tone="inverse"
        className="py-14 md:py-20 lg:py-24"
        label={alt || "Join us"}
      >
        {/* Playful background doodles */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-8 top-12 text-accent opacity-50 sprout-wiggle"
        >
          <SunDoodle className="size-14" />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 right-10 text-accent opacity-40 sprout-float"
        >
          <StarDoodle className="size-12" />
        </div>

        <div className={WRAP}>
          <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            {/* Copy & CTA Action */}
            <div
              className={cn(
                showImage
                  ? "lg:col-span-7"
                  : "mx-auto max-w-3xl text-center lg:col-span-12",
              )}
            >
              <Kicker
                block={block}
                editable={editable}
                className={!showImage ? "justify-center" : undefined}
              />

              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(
                  H2,
                  "mt-4 block text-[color:var(--inverse-foreground)]",
                  showImage ? "max-w-[18ch]" : "mx-auto max-w-[22ch]",
                )}
              />

              <Txt
                block={block}
                field="text"
                editable={editable}
                as="p"
                placeholder="Text"
                className={cn(
                  "mt-4 block text-pretty text-[1.1rem] leading-[1.7] text-muted-foreground",
                  showImage ? "max-w-[46ch]" : "mx-auto max-w-[50ch]",
                )}
              />

              {has(block, "ctaLabel", editable) && (
                <div
                  className={cn(
                    "mt-8 flex flex-wrap gap-4",
                    !showImage && "justify-center",
                  )}
                >
                  <SmartLink href={block.ctaHref} className={BTN_ON_INVERSE}>
                    <Txt
                      block={block}
                      field="ctaLabel"
                      editable={editable}
                      placeholder="Button text"
                    />
                    <Arrow />
                  </SmartLink>
                </div>
              )}
            </div>

            {/* Optional photo blob */}
            {showImage && (
              <div className="lg:col-span-5">
                <BlobImage
                  value={block.image}
                  alt={alt}
                  variant={1}
                  offsetColor="accent"
                />
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
