import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, LABEL, Seal, Section, WRAP, str } from "./ui";

/** Coach lineage and story: martial lineage records and portrait alongside
 *  philosophical narrative with red seal signature. */
export function StoryLineage({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);
  const sig = str(block.signature);

  return (
    <Section label={alt || "Lineage"}>
      <div className={WRAP}>
        <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-14">
          <div className="lg:col-span-5">
            <div className="sticky top-24 space-y-8">
              <figure className="relative">
                <div className="dojo-photo border border-border bg-background p-2.5 shadow-sm">
                  <Img
                    value={block.image}
                    alt={alt}
                    className="aspect-[4/5] w-full"
                  />
                </div>
                {showSetting && (
                  <div className="dojo-photo relative -mt-10 ml-auto w-[62%] border-2 border-background bg-background p-2 shadow-md">
                    <Img
                      value={block.image2}
                      alt={alt}
                      className="aspect-[3/2] w-full"
                    />
                  </div>
                )}
              </figure>
            </div>
          </div>

          <div className="lg:col-span-7 lg:border-l lg:border-border/60 lg:pl-10">
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
              className="mt-8 max-w-[58ch] text-[1.0625rem] leading-[1.8] text-foreground/90 [&_p+p]:mt-5"
            />

            {has(block, "signature", editable) && (
              <div className="mt-10 flex items-center gap-3.5 border-t border-border pt-6">
                <Seal text={sig.charAt(0) || "道"} className="size-8 text-sm" />
                <div>
                  <Txt
                    block={block}
                    field="signature"
                    editable={editable}
                    as="p"
                    placeholder="Your name"
                    className="font-display text-[1.2rem] font-extrabold tracking-tight text-foreground"
                  />
                </div>
              </div>
            )}

            {has(block, "ctaLabel", editable) && (
              <div className="mt-8">
                <SmartLink
                  href={block.ctaHref}
                  className="group dojo-link inline-flex items-center gap-2.5 font-bold text-[0.95rem]"
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
