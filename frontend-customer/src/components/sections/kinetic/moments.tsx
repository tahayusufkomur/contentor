import { cn } from "@/lib/utils";
import { Img, Txt, has, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { DISPLAY, H2, Kicker, LABEL, Marquee, WRAP } from "./ui";

type Photo = { image?: unknown; caption?: string };

/** Two photo reels sliding in opposite directions; greyscale until hovered. */
export function MomentsMarquee({ block, editable }: SectionProps) {
  const photos = itemsOf<Photo>(block, "photos");
  if (!photos.length && !editable) return null;
  const heading = typeof block.heading === "string" ? block.heading : "";
  // Repeat the set so one copy is always wider than the viewport.
  const reel = Array.from(
    { length: Math.max(1, Math.ceil(8 / Math.max(photos.length, 1))) },
    () => photos,
  ).flat();
  const second = [...reel].reverse();

  const tile = (p: Photo, i: number, tall: boolean) => (
    <figure key={i} className="group relative shrink-0 pr-3 md:pr-4">
      <Img
        value={p.image}
        alt={p.caption || heading}
        className={cn(
          tall
            ? "aspect-[4/5] h-[clamp(16rem,30vw,26rem)]"
            : "aspect-square h-[clamp(11rem,19vw,17rem)]",
        )}
        imgClassName="grayscale contrast-[1.15] transition duration-500 group-hover:grayscale-0"
      />
      {tall && p.caption && (
        <figcaption
          className={cn(
            LABEL,
            "absolute bottom-3 left-3 bg-[var(--inverse)] px-2.5 py-2 text-[color:var(--inverse-foreground)]",
          )}
        >
          {p.caption}
        </figcaption>
      )}
    </figure>
  );

  return (
    <section className="kinetic-ink overflow-hidden py-20 md:py-32">
      {(["kicker", "heading", "caption"] as const).some((f) =>
        has(block, f, editable),
      ) && (
        <div
          className={cn(
            WRAP,
            "mb-12 grid gap-8 md:mb-16 lg:grid-cols-12 lg:items-end",
          )}
        >
          <div className="lg:col-span-8">
            <Kicker block={block} editable={editable} />
            {has(block, "heading", editable) && (
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                className={cn(DISPLAY, H2, "mt-5")}
              />
            )}
          </div>
          <Txt
            block={block}
            field="caption"
            editable={editable}
            as="p"
            className="max-w-[40ch] text-lg leading-[1.55] text-[color:var(--k-dim)] lg:col-span-4"
          />
        </div>
      )}
      {photos.length > 0 && (
        <div className="space-y-3 md:space-y-4">
          <Marquee speed="60s" items={reel.map((p, i) => tile(p, i, true))} />
          <Marquee
            speed="48s"
            reverse
            items={second.map((p, i) => tile(p, i, false))}
          />
        </div>
      )}
    </section>
  );
}
