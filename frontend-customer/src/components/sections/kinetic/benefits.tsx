import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { DISPLAY, H2, Kicker, WRAP, pad2 } from "./ui";

type Item = { title?: string; text?: string };

/** Spec sheet on black: cells split by 2px rules, the first cell in volt. */
export function BenefitsSpec({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const n = items.length;
  const odd = n % 2 === 1;
  const withImage = Boolean(imageUrl(block.image));
  const cols = n === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <section className="kinetic-ink py-20 md:py-32">
      <div className={WRAP}>
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-8">
          <div className={withImage ? "lg:col-span-8" : "lg:col-span-9"}>
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(DISPLAY, H2, "mt-5 max-w-[14ch]")}
            />
            <Txt
              block={block}
              field="intro"
              editable={editable}
              as="p"
              className="mt-7 max-w-[52ch] text-lg leading-[1.55] text-[color:var(--k-dim)]"
            />
          </div>
          {withImage && (
            <div className="relative lg:col-span-4">
              <div
                aria-hidden="true"
                className="absolute -right-3 -top-3 h-full w-full bg-primary md:-right-4 md:-top-4"
              />
              <Img
                value={block.image}
                alt={typeof block.heading === "string" ? block.heading : ""}
                className="relative aspect-[3/4] w-full max-sm:aspect-square"
                imgClassName="grayscale contrast-[1.2] object-[50%_20%]"
              />
            </div>
          )}
        </div>

        {n > 0 && (
          <ul
            className={cn(
              "mt-14 grid gap-[2px] border-y-2 border-[color:var(--k-rule)] bg-[color:var(--k-rule)] sm:grid-cols-2 md:mt-20",
              cols,
            )}
          >
            {items.map((it, i) => {
              const lead = i === 0;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex flex-col gap-8 p-6 md:gap-12 md:p-8",
                    lead
                      ? "bg-accent text-accent-foreground"
                      : "bg-[var(--inverse)]",
                    lead && odd && "sm:col-span-2",
                    lead && n === 3 && "lg:col-span-1",
                  )}
                >
                  <span
                    className={cn(
                      DISPLAY,
                      "text-[4.5rem] tabular-nums",
                      lead ? "" : "text-accent",
                    )}
                  >
                    {pad2(i)}
                  </span>
                  <div>
                    <h3
                      className={cn(
                        DISPLAY,
                        "text-[clamp(1.75rem,1.2rem+1.2vw,2.5rem)]",
                      )}
                    >
                      {it.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-3 max-w-[38ch] leading-[1.55]",
                        lead ? "" : "text-[color:var(--k-dim)]",
                      )}
                    >
                      {it.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
