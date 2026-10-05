import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, PopSection, WRAP, str } from "./ui";

type Photo = { image?: unknown; caption?: string };

const TILT = ["-4deg", "3deg", "-2deg", "4.5deg", "-3deg", "2deg"];

/** Berry block with a loose row of taped polaroids. */
export function MomentsPolaroids({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  const heading = str(block.heading);
  const size =
    photos.length <= 3
      ? "lg:max-w-[20rem]"
      : photos.length === 4
        ? "lg:max-w-[18rem]"
        : "lg:max-w-[15.5rem]";
  return (
    <PopSection
      bg="var(--primary)"
      fg="var(--primary-foreground)"
      dark
      className="py-20 md:py-28"
    >
      <div className={WRAP}>
        <div className="mx-auto max-w-4xl text-center">
          <Kicker
            block={block}
            editable={editable}
            fill="sun"
            className="mx-auto"
          />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            className="pop-display pop-h2 mt-6"
            placeholder="Heading"
          />
          <Txt
            block={block}
            field="caption"
            editable={editable}
            as="p"
            className="pop-lede mx-auto mt-6 max-w-[36rem] opacity-90"
          />
        </div>

        <ul className="mt-14 flex flex-wrap justify-center gap-x-4 gap-y-10 md:mt-20 lg:flex-nowrap lg:gap-x-0">
          {photos.map((p, i) => (
            <li
              key={i}
              className={cn(
                "pop-polaroid w-[46%] sm:w-[30%] lg:-mx-1.5 lg:w-auto lg:flex-1",
                size,
                i % 2 === 1 && "lg:translate-y-8",
              )}
              style={{ "--pop-tilt": TILT[i % TILT.length] } as CSSProperties}
            >
              <figure className="border-2 border-[color:var(--pop-ink)] bg-[var(--pop-paper)] p-2.5 pb-3 text-[color:var(--foreground)] shadow-[5px_5px_0_var(--pop-ink)] md:p-3">
                <Img
                  value={p.image}
                  alt={p.caption || heading}
                  className="aspect-[4/5] w-full"
                />
                <figcaption className="pop-h3 flex min-h-[2.75rem] items-center justify-center px-1 pt-2 text-center text-[1.0625rem] md:min-h-[3.25rem]">
                  {p.caption}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </PopSection>
  );
}
