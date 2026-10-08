import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, Section, WRAP, str } from "./ui";

/** Coach story backstage: mirror panels with glowing light bars on the left,
 *  stretched headline, rich rehearsal story, and neon signature on the right. */
export function StoryBackstage({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section tone="surface" label={alt}>
      <div
        className={cn(
          WRAP,
          "grid items-center gap-y-12 md:grid-cols-12 md:gap-x-12 lg:gap-x-16",
        )}
      >
        <div className="order-last md:order-first md:col-span-5">
          <div className="relative mx-auto max-w-md md:max-w-none">
            {/* Mirror wall panels */}
            <div className="relative space-y-4">
              <div className="relative overflow-hidden rounded-[var(--radius)] border border-primary/40 shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_20%,transparent)]">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
                <div
                  aria-hidden="true"
                  className="studiofloor-lightbar absolute inset-0 pointer-events-none"
                />
              </div>

              {showSetting && (
                <div className="relative -mt-8 ml-auto w-3/4 overflow-hidden rounded-[var(--radius)] border border-accent/40 shadow-[0_0_20px_color-mix(in_oklch,var(--accent)_20%,transparent)] md:-mt-12">
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="aspect-[3/2] w-full"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent pointer-events-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-7 lg:col-span-7">
          <Kicker block={block} editable={editable} cue="BACKSTAGE" />

          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(H2, "mt-4 block max-w-[22ch]")}
          />

          <Rich
            block={block}
            field="body"
            editable={editable}
            className="mt-8 max-w-[56ch] text-[1.0625rem] leading-[1.8] text-muted-foreground [&_p]:mb-5"
          />

          {has(block, "signature", editable) && (
            <div className="mt-8 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-px w-10 bg-primary shadow-[0_0_8px_var(--primary)]"
              />
              <Txt
                block={block}
                field="signature"
                editable={editable}
                as="p"
                placeholder="Coach name"
                className="studiofloor-display text-[1.4rem] font-extrabold italic text-primary"
              />
            </div>
          )}

          {has(block, "ctaLabel", editable) && (
            <div className="mt-8">
              <SmartLink
                href={block.ctaHref}
                className="group studiofloor-link inline-flex items-center gap-2 studiofloor-display text-[0.95rem] font-extrabold italic"
              >
                <Txt
                  block={block}
                  field="ctaLabel"
                  editable={editable}
                  placeholder="Link text"
                />
                <Arrow />
              </SmartLink>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
