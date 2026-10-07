import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { BTN_ON_BLACK, Dot, Kicker, Section, WRAP, str } from "./ui";

/** An invitation to a private view set against a pure black gallery band. */
export function CtaPrivateView({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="black" label={alt}>
      <div className={WRAP}>
        <div className="mx-auto flex max-w-[44rem] flex-col items-center text-center">
          {showImage && (
            <Img
              value={block.image}
              alt={alt}
              className="mb-12 aspect-[16/9] w-full"
            />
          )}
          <div className="flex items-center justify-center gap-2.5">
            <Dot />
            <Kicker
              block={block}
              editable={editable}
              className="text-[color:var(--inverse-foreground)]"
            />
          </div>
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className="mt-5 block max-w-[18ch] text-balance break-words font-display text-[clamp(2rem,1.4rem+2.6vw,4rem)] font-bold leading-[1.02] tracking-[-0.02em]"
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[44ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground"
          />
          {has(block, "ctaLabel", editable) && (
            <div className="mt-9">
              <SmartLink href={block.ctaHref} className={BTN_ON_BLACK}>
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Button text"
                />
              </SmartLink>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
