import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, PopButton, PopSection, WRAP, str } from "./ui";

/** Chartreuse band crossed by a plum ribbon that runs the button text. */
export function CtaMarquee({ block, editable }: SectionProps) {
  const label = str(block.ctaLabel);
  const withImage = Boolean(imageUrl(block.image));
  const run = Array.from({ length: 8 }, () => label);
  return (
    <PopSection bg="var(--accent)" className="pb-20 md:pb-28">
      {label && (
        <div
          aria-hidden="true"
          className="relative -mx-6 -rotate-2 py-6 md:py-8"
        >
          <div className="overflow-hidden border-y-2 border-[color:var(--pop-ink)] bg-[var(--inverse)] py-3 text-[color:var(--accent)] md:py-4">
            <div className="pop-marquee-track">
              {[0, 1].map((half) => (
                <div key={half} className="flex shrink-0">
                  {run.map((t, i) => (
                    <span
                      key={i}
                      className="pop-display flex items-center whitespace-nowrap text-[1.75rem] md:text-[2.5rem]"
                    >
                      <span className="px-6 md:px-9">{t}</span>
                      <span className="text-[color:var(--pop-pink)]">✦</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          WRAP,
          "mt-10 grid items-center gap-x-16 gap-y-14 md:mt-14",
          withImage ? "lg:grid-cols-12" : "justify-items-center text-center",
        )}
      >
        {withImage && (
          <div className="relative mx-auto w-full max-w-xl pr-2 lg:col-span-5">
            <div className="pop-card -rotate-2 overflow-hidden">
              <Img
                value={block.image}
                alt={str(block.heading)}
                className="aspect-[4/3] w-full"
              />
            </div>
          </div>
        )}
        <div className={cn(withImage ? "lg:col-span-7" : "max-w-5xl")}>
          <Kicker
            block={block}
            editable={editable}
            fill="paper"
            className={cn(!withImage && "mx-auto")}
          />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className="pop-display mt-6 text-[clamp(2.75rem,1.2rem+4.8vw,6rem)]"
            placeholder="Heading"
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            className={cn(
              "pop-lede mt-6 max-w-[36rem]",
              !withImage && "mx-auto",
            )}
          />
          <div className="mt-10">
            <PopButton
              block={block}
              editable={editable}
              label="ctaLabel"
              href="ctaHref"
              className="!min-h-[4rem] !px-9 !text-[1.1875rem]"
            />
          </div>
        </div>
      </div>
    </PopSection>
  );
}
