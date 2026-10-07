import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, Arrow, H2, Halo, Kicker, Section, WRAP, str } from "./ui";

/** An evening letter: arched portrait with warm halo and detail circle on the
 *  left, soft serif story and signature on the right. */
export function StoryEvening({ block, editable }: SectionProps) {
  const alt = str(block.heading);

  return (
    <Section label={alt}>
      <div
        className={cn(
          WRAP,
          "grid items-center gap-y-12 md:grid-cols-12 md:gap-x-10",
        )}
      >
        <div className="order-last md:order-first md:col-span-5">
          <Halo className="[--nocturne-halo:0.6]">
            <figure className="relative mx-auto w-full max-w-[22rem]">
              <Img
                value={block.image}
                alt={alt}
                className={cn(
                  ARCH,
                  "aspect-[4/5] w-full max-w-[22rem] mx-auto",
                )}
              />
            </figure>
          </Halo>
        </div>

        <div className="md:col-span-6 md:col-start-7">
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
            className="mt-8 max-w-[58ch] text-[1.0625rem] leading-[1.8] text-muted-foreground [&_p]:mb-5"
          />
          {has(block, "signature", editable) && (
            <Txt
              block={block}
              field="signature"
              editable={editable}
              as="p"
              placeholder="Your name"
              className="nocturne-soft mt-8 block font-display text-[1.8rem] leading-none text-primary"
            />
          )}
          {has(block, "ctaLabel", editable) && (
            <SmartLink
              href={block.ctaHref}
              className="group nocturne-link mt-8 inline-flex items-center gap-2 text-[0.95rem] font-medium"
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
