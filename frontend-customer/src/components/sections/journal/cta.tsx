import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, PILL_ON_MOSS, Section, WRAP, str } from "./ui";

/** The moss band: the page's one colour block. A serif invitation and a paper
 *  pill; with a photo, the print sits beside it like a facing page. */
export function CtaBand({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const copy = (
    <>
      <Kicker block={block} editable={editable} />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(
          "mt-5 block text-balance break-words font-display font-light tracking-[-0.02em]",
          "text-[clamp(2.25rem,1.5rem+2.7vw,4.25rem)] leading-[1.06]",
          showImage ? "max-w-[18ch]" : "mx-auto max-w-[20ch]",
        )}
      />
      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className={cn(
          "journal-moss-muted mt-7 block max-w-[44ch] text-pretty text-[1.0625rem] leading-[1.65]",
          !showImage && "mx-auto",
        )}
      />
      <div className="mt-10">
        <SmartLink href={block.ctaHref} className={PILL_ON_MOSS}>
          <Txt
            block={block}
            field="ctaLabel"
            editable={editable}
            placeholder="Button text"
          />
        </SmartLink>
      </div>
    </>
  );

  return (
    <Section tone="moss" label={alt}>
      {showImage ? (
        <div
          className={cn(
            WRAP,
            "grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-10",
          )}
        >
          <Img
            value={block.image}
            alt={alt}
            className="aspect-[4/3] w-full lg:col-span-6 lg:aspect-[5/4]"
          />
          <div className="lg:col-span-6 lg:col-start-7 lg:pl-6">{copy}</div>
        </div>
      ) : (
        <div className={cn(WRAP, "text-center")}>{copy}</div>
      )}
    </Section>
  );
}
