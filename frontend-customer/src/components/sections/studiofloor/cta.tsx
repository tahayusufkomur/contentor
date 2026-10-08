import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BTN_ON_INVERSE, H2, Kicker, Section, WRAP, str } from "./ui";

/** The spotlight call-to-action: the one high-contrast inverse band on the
 *  dark page with stage spotlight cone lighting radiating down on the invitation. */
export function CtaSpotlight({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const content = (
    <div className="flex flex-col items-center text-center">
      <Kicker block={block} editable={editable} cue="SPOTLIGHT" />

      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(H2, "mt-4 block max-w-[20ch]")}
      />

      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className="mt-6 block max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.68] text-muted-foreground"
      />

      {has(block, "ctaLabel", editable) && (
        <div className="mt-10">
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
  );

  return (
    <Section tone="spotlight" label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <div className="lg:col-span-7">{content}</div>
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md overflow-hidden rounded-[var(--radius)] border-2 border-[var(--inverse-foreground)]/20 shadow-xl">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/3] w-full"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">{content}</div>
        )}
      </div>
    </Section>
  );
}
