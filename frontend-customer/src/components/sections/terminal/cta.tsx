import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, BTN, H2, Kicker, Section, WindowChrome, WRAP, str } from "./ui";

/** Call-to-action inside a terminal window. */
export function CtaInstall({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const commandBox = (
    <div className="flex flex-col justify-between">
      <div>
        <Kicker block={block} editable={editable} className="block" />

        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className={cn(
            H2,
            "mt-4 block max-w-[20ch] text-balance break-words font-display text-[clamp(2rem,1.4rem+2.4vw,3.8rem)] font-bold leading-[1.06]",
          )}
        />

        <Txt
          block={block}
          field="text"
          editable={editable}
          as="p"
          placeholder="Text"
          className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
        />
      </div>

      {has(block, "ctaLabel", editable) && (
        <div className="mt-8 pt-6 border-t border-border/60">
          <SmartLink href={block.ctaHref} className={BTN}>
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
    <Section tone="console" label={alt}>
      <div className={WRAP}>
        <WindowChrome bodyClassName="p-6 sm:p-10 md:p-12">
          {showImage ? (
            <div className="grid items-center gap-y-10 lg:grid-cols-12 lg:gap-x-12">
              <div className="lg:col-span-7">{commandBox}</div>
              <figure className="lg:col-span-5">
                <WindowChrome bodyClassName="p-0 overflow-hidden">
                  <Img
                    value={block.image}
                    alt={alt}
                    className="aspect-[16/10] w-full"
                  />
                </WindowChrome>
              </figure>
            </div>
          ) : (
            <div className="max-w-3xl">{commandBox}</div>
          )}
        </WindowChrome>
      </div>
    </Section>
  );
}
