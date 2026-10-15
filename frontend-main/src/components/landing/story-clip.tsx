import { MediaVideo } from "@/components/ui/media-video";
import type { MediaItem } from "@/lib/media";

/** A chapter's footage, played in view at its own pace (no scroll-linked
 * seeking: native playback stays smooth), with the three steps it shows
 * numbered underneath. Sized so the clip and its steps fit one screen. */
export function StoryClip({
  clip,
  label,
  steps,
}: {
  clip: MediaItem;
  label: string;
  steps: string[];
}) {
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
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-caption font-semibold tabular-nums text-muted-foreground">
              0{i + 1}
            </span>
            <span className="text-body text-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
