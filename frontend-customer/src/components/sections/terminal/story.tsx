import { cn } from "@/lib/utils";
import { Img, Rich, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, H2, Kicker, Section, WindowChrome, WRAP, str } from "./ui";
import { useTranslations } from "next-intl";

/** Coach story rendered as an open-source README.md file in a code editor window
 *  with line numbers, metadata tags, and developer photos. */
export function StoryReadme({ block, editable }: SectionProps) {
  const t = useTranslations("site");
  const alt = str(block.heading);
  const showSetting = Boolean(imageUrl(block.image2)) || Boolean(editable);

  return (
    <Section tone="console" label={alt}>
      <div className={WRAP}>
        <WindowChrome bodyClassName="p-6 sm:p-10 md:p-12">
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            {/* Photos pane */}
            <div className="order-last lg:order-first relative lg:col-span-5">
              <WindowChrome bodyClassName="p-0 overflow-hidden">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </WindowChrome>

              {showSetting && (
                <div className="relative -mt-10 ml-auto w-[75%] sm:w-[65%]">
                  <WindowChrome
                    bodyClassName="p-0 overflow-hidden"
                    className="shadow-xl"
                  >
                    <Img
                      value={block.image2}
                      alt={alt}
                      className="aspect-[3/2] w-full"
                    />
                  </WindowChrome>
                </div>
              )}
            </div>

            {/* Markdown Content with Line Gutter */}
            <div className="lg:col-span-7">
              <Kicker block={block} editable={editable} />

              <div className="mt-4 flex items-baseline gap-3">
                <span
                  className="font-mono text-2xl font-bold text-primary select-none"
                  aria-hidden="true"
                >
                  #
                </span>
                <Txt
                  block={block}
                  field="heading"
                  editable={editable}
                  as="h2"
                  placeholder={t("placeholder.heading")}
                  className={cn(H2, "block max-w-[20ch]")}
                />
              </div>

              <div className="mt-8 border-l-2 border-border pl-5 sm:pl-7">
                <Rich
                  block={block}
                  field="body"
                  editable={editable}
                  className="max-w-[56ch] text-[1.05rem] leading-[1.8] text-foreground/90 [&_p]:mb-4"
                />
              </div>

              {has(block, "signature", editable) && (
                <div className="mt-8 flex items-center gap-2 font-mono text-[0.95rem] text-accent">
                  <Txt
                    block={block}
                    field="signature"
                    editable={editable}
                    placeholder={t("placeholder.yourName")}
                    className="font-bold"
                  />
                </div>
              )}

              {has(block, "ctaLabel", editable) && (
                <div className="mt-8">
                  <SmartLink
                    href={block.ctaHref}
                    className="group terminal-link inline-flex items-center gap-2 text-[0.95rem] font-bold"
                  >
                    <span
                      className="text-muted-foreground select-none"
                      aria-hidden="true"
                    >
                      [
                    </span>
                    <Txt
                      block={block}
                      field="ctaLabel"
                      editable={editable}
                      placeholder={t("placeholder.linkText")}
                    />
                    <span
                      className="text-muted-foreground select-none"
                      aria-hidden="true"
                    >
                      ]
                    </span>
                    <Arrow />
                  </SmartLink>
                </div>
              )}
            </div>
          </div>
        </WindowChrome>
      </div>
    </Section>
  );
}
