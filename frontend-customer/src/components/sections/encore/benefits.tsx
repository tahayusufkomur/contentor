import { cn } from "@/lib/utils";
import { Img, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { BOX, H3, Opener, Section, Track, WRAP, pad2, str } from "./ui";

type Item = { title?: string; text?: string };

/** Benefits setlist: numbered tracks separated by hairlines under a 3px rule, with optional sticky halftone sleeve. */
export function BenefitsSetlist({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const list = (
    <ol
      className={cn("border-t-[3px] border-foreground", !showImage && "mt-12")}
    >
      {items.map((it, i) => (
        <li
          key={i}
          className="grid items-baseline gap-x-8 gap-y-2 border-b border-foreground py-6 sm:grid-cols-[4rem_minmax(0,5fr)_minmax(0,6fr)]"
        >
          <Track>{pad2(i)}</Track>
          <h3
            className={cn(
              H3,
              "text-[1.25rem] uppercase tracking-[-0.01em] md:text-[1.5rem]",
            )}
          >
            {it.title}
          </h3>
          <p className="max-w-[46ch] text-[0.98rem] leading-[1.6] text-muted-foreground">
            {it.text}
          </p>
        </li>
      ))}
    </ol>
  );

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <Opener block={block} editable={editable} />
        {showImage ? (
          <div className="mt-12 grid gap-y-12 lg:grid-cols-12 lg:gap-x-10">
            <div className="lg:col-span-4">
              <div
                className={cn(
                  BOX,
                  "encore-halftone relative max-w-sm p-2 lg:sticky lg:top-24",
                )}
              >
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[3/4] w-full"
                />
              </div>
            </div>
            <div className="lg:col-span-8">{list}</div>
          </div>
        ) : (
          list
        )}
      </div>
    </Section>
  );
}
