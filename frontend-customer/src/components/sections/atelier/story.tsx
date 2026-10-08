import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, ArchFrame, Arrow, H2, Kicker, Section, WRAP, str } from "./ui";

/** Coach story in the atelier salon: reflective text with signature on the left,
 *  an arch-framed portrait with setting details on the right. */
export function StorySalon({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section label={alt || "Story"}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-12 md:grid-cols-12 md:gap-x-10 lg:gap-x-14">
          <div
            className={
              showImage
                ? "md:col-span-7 lg:col-span-7"
                : "md:col-span-10 lg:col-span-8"
            }
          >
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-4 block max-w-[20ch]")}
            />
            <Rich
              block={block}
              field="body"
              editable={editable}
              className="mt-8 max-w-[58ch] text-[1.0625rem] leading-[1.85] text-muted-foreground [&_p+p]:mt-5"
            />
            {has(block, "signature", editable) && (
              <p className="mt-8 font-display text-[1.35rem] italic tracking-tight text-primary">
                <span aria-hidden="true">&mdash;&nbsp;</span>
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
                  className="group atelier-link inline-flex items-center gap-2 font-medium text-foreground"
                >
                  <Txt
                    block={block}
                    field="ctaLabel"
                    editable={editable}
                    placeholder="Read more"
                  />
                  <Arrow />
                </SmartLink>
              </div>
            )}
          </div>

          {showImage && (
            <div className="relative md:col-span-5 lg:col-span-4 lg:col-start-9">
              <ArchFrame className="mx-auto max-w-sm md:max-w-none">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(ARCH, "aspect-[3/4] w-full")}
                />
              </ArchFrame>
              {showSetting && (
                <div className="relative -mt-10 ml-auto w-[65%] max-w-[13rem] sm:-mt-14">
                  <div className="overflow-hidden rounded-2xl border-2 border-background shadow-md">
                    <Img
                      value={block.image2}
                      alt={alt}
                      className="aspect-[3/2] w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
