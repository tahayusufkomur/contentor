import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { makeStoryPull } from "../story-layouts";
import { H2, Kicker, MoonPhases, Section, StarGlyph, WRAP, str } from "./ui";

/** Story "origin": coach lineage and story with oval gold portrait frame. */
export function StoryOrigin({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  return (
    <Section tone="surface" label={alt || "Origin story"}>
      <div className={WRAP}>
        <div className="grid items-center gap-y-12 lg:grid-cols-12 lg:gap-x-12">
          {showImage ? (
            <div className="relative mx-auto w-full max-w-md lg:col-span-5">
              {/* Outer gold oval frame */}
              <div
                aria-hidden="true"
                className="absolute inset-0 -m-2 rounded-full border border-[color-mix(in_oklch,var(--primary)_30%,transparent)]"
              />
              <figure className="relative overflow-hidden rounded-full border border-[color-mix(in_oklch,var(--primary)_60%,transparent)] p-1.5 shadow-2xl">
                <Img
                  value={block.image}
                  alt={alt}
                  className="sanctum-oval aspect-[4/5] w-full"
                />
              </figure>

              {showSetting && (
                <figure className="absolute -bottom-6 -right-3 w-1/2 overflow-hidden rounded-t-full border border-primary bg-background p-1 shadow-xl md:-bottom-8 md:-right-6">
                  <Img
                    value={block.image2}
                    alt={alt}
                    className="sanctum-arch aspect-[3/2] w-full"
                  />
                </figure>
              )}
            </div>
          ) : null}

          <div
            className={cn(
              showImage
                ? "lg:col-span-7 lg:col-start-6"
                : "mx-auto max-w-3xl text-center lg:col-span-12",
            )}
          >
            <Kicker block={block} editable={editable} />
            <MoonPhases
              className={cn(
                "mt-3.5",
                showImage ? "justify-start" : "justify-center",
              )}
            />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(H2, "mt-5 max-w-[20ch]")}
            />
            <Rich
              block={block}
              field="body"
              editable={editable}
              className="mt-8 max-w-[62ch] text-[1.0625rem] leading-[1.8] text-muted-foreground [&_p]:mb-4"
            />

            {has(block, "signature", editable) && (
              <div
                className={cn(
                  "mt-8 flex items-center gap-2.5 font-display text-[1rem] uppercase tracking-[0.14em] text-primary",
                  !showImage && "justify-center",
                )}
              >
                <StarGlyph className="size-3" />
                <Txt
                  block={block}
                  field="signature"
                  editable={editable}
                  placeholder="Your name"
                />
              </div>
            )}

            {has(block, "ctaLabel", editable) && (
              <div className={cn("mt-8 flex", !showImage && "justify-center")}>
                <SmartLink
                  href={block.ctaHref}
                  className="group sanctum-link inline-flex items-center gap-2 font-display text-[0.85rem] font-medium uppercase tracking-[0.12em]"
                >
                  <Txt
                    block={block}
                    field="ctaLabel"
                    editable={editable}
                    placeholder="Link text"
                  />
                  <StarGlyph className="size-3 text-primary transition-transform duration-300 motion-safe:group-hover:rotate-45" />
                </SmartLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

/** An invocation: the heading as one large line of light, the story in two
 *  columns beside a small oval portrait. */
export const StoryInvocation = makeStoryPull({
  Section: (p) => <Section tone="surface" {...p} />,
  wrap: WRAP,
  h2: H2,
  Kicker,
  Ornament: MoonPhases,
  body: "text-[1.0625rem] leading-[1.8] text-muted-foreground [&_p]:mb-4",
  signature:
    "font-display text-[1rem] uppercase tracking-[0.14em] text-primary",
  signatureMark: <StarGlyph className="size-3" />,
  link: "sanctum-link font-display text-[0.85rem] font-medium uppercase tracking-[0.12em]",
  LinkIcon: ({ className }) => (
    <StarGlyph
      className={cn(
        "size-3 text-primary transition-transform duration-300 motion-safe:group-hover:rotate-45",
        className,
      )}
    />
  ),
  photo: "sanctum-oval rounded-full border border-primary/60",
});
