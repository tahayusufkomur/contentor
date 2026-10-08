import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { H3, LABEL, Opener, Section, WRAP, pad2, str } from "./ui";

type Item = { title?: string; text?: string };

/** Dojo disciplines: learning pillars set out with hard rules and discipline rank numbering. */
export function BenefitsDisciplines({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const grid = (
    <ul className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it, i) => (
        <li
          key={i}
          className="flex flex-col justify-between bg-background p-6 md:p-8 transition-colors hover:bg-muted/30"
        >
          <div>
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <span className={cn(LABEL, "text-accent")}>
                Discipline {pad2(i)}
              </span>
              <span
                aria-hidden="true"
                className="font-display text-[0.95rem] font-bold text-muted-foreground/60 select-none"
              >
                {["一", "二", "三", "四", "五", "六"][i] || pad2(i)}
              </span>
            </div>
            <h3
              className={cn(
                H3,
                "mt-4 text-[1.2rem] leading-snug text-foreground md:text-[1.3rem]",
              )}
            >
              {it.title}
            </h3>
            {it.text && (
              <p className="mt-2 text-[0.95rem] leading-[1.65] text-muted-foreground">
                {it.text}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <Section label={alt || "Disciplines"}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />

        {showImage ? (
          <div className="mt-14 grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            <figure className="lg:col-span-4">
              <div className="dojo-photo sticky top-24 border border-border bg-background p-2.5">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
              </div>
            </figure>
            <div className="lg:col-span-8">
              <ul className="grid gap-px border border-border bg-border sm:grid-cols-2">
                {items.map((it, i) => (
                  <li
                    key={i}
                    className="flex flex-col justify-between bg-background p-6 transition-colors hover:bg-muted/30"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <span className={cn(LABEL, "text-accent")}>
                          Discipline {pad2(i)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="font-display text-[0.95rem] font-bold text-muted-foreground/60 select-none"
                        >
                          {["一", "二", "三", "四", "五", "六"][i] || pad2(i)}
                        </span>
                      </div>
                      <h3
                        className={cn(
                          H3,
                          "mt-4 text-[1.2rem] leading-snug text-foreground",
                        )}
                      >
                        {it.title}
                      </h3>
                      {it.text && (
                        <p className="mt-2 text-[0.95rem] leading-[1.65] text-muted-foreground">
                          {it.text}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="mt-14">{grid}</div>
        )}
      </div>
    </Section>
  );
}
