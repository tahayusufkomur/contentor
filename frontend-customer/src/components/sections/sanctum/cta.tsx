import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  BTN_ON_LUMINOUS,
  H2,
  Kicker,
  MoonPhases,
  Section,
  StarGlyph,
  WRAP,
  ZodiacRing,
  str,
} from "./ui";

/** Call to action "begin": A luminous celestial gateway on pearl with rotating indigo ring. */
export function CtaBegin({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const card = (
    <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
      <Kicker block={block} editable={editable} />
      <MoonPhases className="mt-4" />

      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Heading"
        className={cn(
          H2,
          "mt-6 max-w-[20ch] text-[clamp(2rem,1.4rem+2.8vw,3.8rem)] text-[color:var(--inverse-foreground)]",
        )}
      />

      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Text"
        className="mt-6 max-w-[48ch] text-pretty text-[1.0625rem] leading-[1.75] text-muted-foreground"
      />

      {has(block, "ctaLabel", editable) && (
        <div className="mt-10">
          <SmartLink href={block.ctaHref} className={BTN_ON_LUMINOUS}>
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder="Button text"
            />
            <StarGlyph className="size-3.5 text-primary-foreground" />
          </SmartLink>
        </div>
      )}
    </div>
  );

  return (
    <Section tone="luminous" label={alt || "Initiation"}>
      <div className={cn(WRAP, "relative")}>
        {/* Zodiac Ring in luminous tone */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ZodiacRing
            size={600}
            className="opacity-25 text-[color:var(--inverse-foreground)]"
          />
        </div>

        <div className="relative z-10">
          {showImage ? (
            <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
              <figure className="relative mx-auto w-full max-w-sm overflow-hidden rounded-t-full border-2 border-[color-mix(in_oklch,var(--inverse-foreground)_30%,transparent)] p-1.5 shadow-2xl lg:col-span-5">
                <Img
                  value={block.image}
                  alt={alt}
                  className="sanctum-arch aspect-[4/5] w-full"
                />
              </figure>
              <div className="lg:col-span-7">{card}</div>
            </div>
          ) : (
            card
          )}
        </div>
      </div>
    </Section>
  );
}
