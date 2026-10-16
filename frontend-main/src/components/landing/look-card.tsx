import type { MediaItem } from "@/lib/media";

export interface LookCardProps {
  /** The caption: who the look is for, e.g. "Yoga creators". */
  name: string;
  /** 4:5 coach photograph. */
  still: MediaItem;
  /** The look's phone screenshot (375×812 at 2x). */
  render: MediaItem;
  renderAlt: string;
}

/** One card of the "Who it's for" row: the coach beside her site on a phone,
 * both cropped to one row height, captioned with who it is for. Images are
 * lazy; the small twins cover these sizes at 2x. */
export function LookCard({ name, still, render, renderAlt }: LookCardProps) {
  const srcSet = (m: MediaItem) =>
    m.srcSmall
      ? `${m.srcSmall} ${m.width / 2}w, ${m.src} ${m.width}w`
      : undefined;
  return (
    <figure className="flex flex-col">
      <div className="flex h-[200px] gap-3 md:h-[260px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF with its own srcSet */}
        <img
          src={still.src}
          srcSet={srcSet(still)}
          sizes="(max-width: 767px) 160px, 208px"
          alt={still.alt ?? ""}
          width={still.width}
          height={still.height}
          loading="lazy"
          decoding="async"
          className="h-full w-auto aspect-[4/5] rounded-tile bg-muted object-cover"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF with its own srcSet */}
        <img
          src={render.src}
          srcSet={srcSet(render)}
          sizes="(max-width: 767px) 92px, 120px"
          alt={renderAlt}
          width={render.width}
          height={render.height}
          loading="lazy"
          decoding="async"
          className="h-full w-auto aspect-[375/812] rounded-[22px] bg-muted object-cover"
        />
      </div>
      <figcaption className="mt-3 text-caption text-muted-foreground">
        {name}
      </figcaption>
    </figure>
  );
}
