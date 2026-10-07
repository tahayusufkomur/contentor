import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BTN, Kicker, Section, Stamp, WRAP, str } from "./ui";

/** Call to action on the pine band: slab invitation, blaze lace-up button, and ink milestone stamp. */
export function CtaLaceUp({ block, editable }: SectionProps) {
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
          "mt-4 block max-w-[18ch] text-balance break-words font-display text-[clamp(2.2rem,1.5rem+2.8vw,4.3rem)] font-bold leading-[1.04]",
          !showImage && "mx-auto",
        )}
      />
      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className={cn(
          "mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground",
          !showImage && "mx-auto",
        )}
      />
      <div
        className={cn(
          "mt-9 flex flex-wrap items-center gap-6",
          !showImage && "justify-center",
        )}
      >
        <SmartLink href={block.ctaHref} className={BTN}>
          <Txt
            block={block}
            field="ctaLabel"
            editable={editable}
            placeholder="Button text"
          />
          <Arrow />
        </SmartLink>
        <Stamp>
          Lace
          <br />
          up
        </Stamp>
      </div>
    </>
  );

  return (
    <Section tone="pine" label={alt}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            <Img
              value={block.image}
              alt={alt}
              className="aspect-[16/10] w-full rounded-[var(--radius)] border-2 border-[var(--inverse-foreground)] lg:col-span-6"
            />
            <div className="lg:col-span-6">{copy}</div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[46rem] flex-col items-center text-center">
            {copy}
          </div>
        )}
      </div>
    </Section>
  );
}
