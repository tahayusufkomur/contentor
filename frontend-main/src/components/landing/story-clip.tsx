import { MediaVideo } from "@/components/ui/media-video";
import type { MediaItem } from "@/lib/media";

/** A chapter's footage, played in view at its own pace (no scroll-linked
 * seeking: native playback stays smooth), sized to fit one screen. */
export function StoryClip({ clip, label }: { clip: MediaItem; label: string }) {
  return (
    <figure
      className="mx-auto px-6"
      style={{
        maxWidth: `min(1100px, (100svh - 220px) * ${clip.width / clip.height})`,
      }}
    >
      <MediaVideo
        src={clip.src}
        webm={clip.webm}
        phoneSrc={clip.phoneSrc}
        // landing-media.test.ts guarantees every clip has a poster.
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        posterLoading="lazy"
        label={label}
        className="rounded-tile"
      />
    </figure>
  );
}
