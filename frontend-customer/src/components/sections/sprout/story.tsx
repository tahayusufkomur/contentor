import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BlobImage,
  H2,
  HeartDoodle,
  Kicker,
  Section,
  WRAP,
  str,
} from "./ui";

/** Coach story intro with organic photo blob, rich personal narrative,
 *  and a friendly handwritten-style sign-off in Fredoka. */
export function StoryHello({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showMain = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label={alt || "About me"}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-12 md:grid-cols-12 md:gap-x-10 lg:gap-x-14">
          {/* Photos column */}
          {showMain && (
            <div className="relative md:col-span-5 lg:col-span-5">
              <BlobImage
                value={block.image}
                alt={alt}
                variant={2}
                offsetColor="primary"
              />

              {/* Secondary setting photo */}
              {showSetting && (
                <div className="absolute -bottom-6 -right-2 w-[46%] max-w-[12rem] md:-right-6">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-2 rotate-[-4deg] rounded-3xl bg-[color-mix(in_oklch,var(--accent)_35%,transparent)]"
                  />
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="relative aspect-[3/2] w-full rounded-3xl border-4 border-background shadow-md rotate-[-2deg]"
                  />
                </div>
              )}
            </div>
          )}

          {/* Narrative copy column */}
          <div
            className={cn(
              "md:col-span-7 lg:col-span-7",
              !showMain &&
                "md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3",
            )}
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
              className="mt-6 max-w-[56ch] text-[1.0625rem] leading-[1.8] text-muted-foreground"
            />

            {/* Coach signature in display font Fredoka */}
            {has(block, "signature", editable) && (
              <div className="mt-8 flex items-center gap-3">
                <HeartDoodle className="size-5 text-primary opacity-80" />
                <p className="font-display text-[1.4rem] font-semibold tracking-[-0.01em] text-foreground">
                  <Txt
                    block={block}
                    field="signature"
                    editable={editable}
                    placeholder="Your name"
                  />
                </p>
              </div>
            )}

            {has(block, "ctaLabel", editable) && (
              <div className="mt-8">
                <SmartLink
                  href={block.ctaHref}
                  className="group inline-flex min-h-11 items-center gap-2 font-display text-[1.05rem] font-bold text-primary transition-colors hover:text-accent-foreground"
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
      </div>
    </Section>
  );
}
