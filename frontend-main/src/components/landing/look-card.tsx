import type { MediaItem } from "@/lib/media";

export interface LookCardProps {
  /** The caption: who the look is for, e.g. "Yoga teachers". */
  name: string;
  /** 4:5 coach photograph. */
  still: MediaItem;
  /** The look's phone screenshot (375×812 at 2x). */
  render: MediaItem;
  renderAlt: string;
}

/** One gallery slide (spec 5.4 ch. 3): the coach beside her site on a phone,
 * both cropped to one row height, captioned with who it is for. Images are
 * lazy with an 800 px source for phones; the gallery is well below the fold. */
export function LookCard({ name, still, render, renderAlt }: LookCardProps) {
  const srcSet = (m: MediaItem) =>
    m.srcSmall
      ? `${m.srcSmall} ${m.width / 2}w, ${m.src} ${m.width}w`
      : undefined;
  return (
    <figure className="flex flex-col">
      <div className="flex h-[260px] gap-3 md:h-[440px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF with its own srcSet */}
        <img
          src={still.src}
          srcSet={srcSet(still)}
          sizes="(max-width: 767px) 208px, 352px"
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
          sizes="(max-width: 767px) 120px, 203px"
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
