import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BTN_ON_INK, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Enrolment slip call-to-action on ink background with bordered card. */
export function CtaEnrol({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const slip = (
    <div className="rounded-[var(--radius)] border-2 border-[var(--inverse-foreground)] p-8 md:p-12">
      <p className={cn(LABEL, "text-[color:var(--inverse-foreground)]")}>
        Enrolment slip
      </p>
      <Kicker block={block} editable={editable} className="mt-4" />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className="mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.1rem,1.5rem+2.6vw,4rem)] font-semibold leading-[1.06]"
      />
      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
      />
      {has(block, "ctaLabel", editable) && (
        <div className="mt-9">
          <SmartLink href={block.ctaHref} className={BTN_ON_INK}>
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
    <Section tone="ink" label={alt}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-10">
          {showImage ? (
            <>
              <figure className="lg:col-span-5">
                <Img
                  value={block.image}
                  alt={alt}
                  className="primer-print aspect-[16/10] w-full rotate-[-1.5deg]"
                />
              </figure>
              <div className="lg:col-span-7">{slip}</div>
            </>
          ) : (
            <div className="lg:col-span-8 lg:col-start-3">{slip}</div>
          )}
        </div>
      </div>
    </Section>
  );
}
