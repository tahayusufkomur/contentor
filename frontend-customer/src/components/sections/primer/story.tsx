import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, Page, Section, WRAP, str } from "./ui";

/** Coach foreword on ruled exercise-book paper with tilted prints and signature. */
export function StoryForeword({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section tone="ruled" label={alt}>
      <div className={WRAP}>
        <Page className="grid gap-y-12 md:grid-cols-12 md:gap-x-10">
          <figure className="order-last md:order-first relative md:col-span-5">
            <Img
              value={block.image}
              alt={alt}
              className="primer-print aspect-[4/5] w-full rotate-[-1.5deg]"
            />
            {showSetting && (
              <Img
                value={block.image2}
                alt={alt}
                className="primer-print relative -mt-10 ml-auto aspect-[3/2] w-[60%] rotate-[2deg]"
              />
            )}
          </figure>

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
              className="mt-8 max-w-[60ch] text-[1.0625rem] leading-[2rem] [&_p]:mb-0"
            />
            {has(block, "signature", editable) && (
              <p className="primer-courier mt-8 text-[1.05rem] text-accent">
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
              <SmartLink
                href={block.ctaHref}
                className="group primer-link mt-8 inline-flex items-center gap-2 font-bold"
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
        </Page>
      </div>
    </Section>
  );
}
