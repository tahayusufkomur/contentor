import { cn } from "@/lib/utils";
import { EmptyHint, Txt, has } from "../kit";
import type { StyleKit } from "../kit-contract";
import type { SectionProps } from "../types";
import { LoopVideo } from "./loop-video";

/** A video field: `url` and `poster` are signed on read from `video_id`. */
type VideoValue = {
  url?: string | null;
  video_id?: number | null;
  poster?: string | null;
};

/** The clip's file: a library clip, or a pasted link straight to a video file.
 *  A page link (YouTube, Vimeo) cannot play on a loop, so it is no clip. */
export function clipSrc(value: VideoValue): string {
  const url = typeof value.url === "string" ? value.url : "";
  if (!url) return "";
  return value.video_id || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? url : "";
}

/** Her clip, playing on a loop: a phone clip stands 9:16 beside her words, a
 *  wide one runs the width under them. No clip, nothing on the public site. */
export function VideoNeutral({
  block,
  editable,
  kit,
}: SectionProps & { kit: StyleKit }) {
  const value = (block.video ?? {}) as VideoValue;
  const src = clipSrc(value);
  if (!src && !editable) return null;
  const wide = block.shape === "wide";
  const heading = typeof block.heading === "string" ? block.heading : "";
  const words =
    has(block, "heading", editable) || has(block, "caption", editable);

  return (
    <kit.Section tone="base">
      <div
        className={cn(
          kit.wrap,
          wide || !words
            ? "flex flex-col gap-10"
            : "grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16",
        )}
      >
        {words && (
          <div className="flex flex-col gap-5">
            {has(block, "heading", editable) && (
              <Txt
                block={block}
                field="heading"
                editable={editable}
                as="h2"
                placeholder="Heading"
                className={cn(kit.h2, "block max-w-[22ch]")}
              />
            )}
            {has(block, "caption", editable) && (
              <Txt
                block={block}
                field="caption"
                editable={editable}
                as="p"
                placeholder="Caption"
                className="block max-w-[46ch] text-pretty text-lg/relaxed text-muted-foreground"
              />
            )}
          </div>
        )}
        {src ? (
          <LoopVideo
            src={src}
            poster={value.poster ?? undefined}
            label={heading || "A short clip"}
            className={cn(
              "w-full",
              wide
                ? "aspect-video"
                : cn(
                    "mx-auto aspect-[9/16] max-w-[22rem]",
                    words && "md:mx-0 md:w-[22rem]",
                  ),
            )}
          />
        ) : (
          <EmptyHint
            editable={editable}
            title="No clip yet"
            text="Pick a clip in the panel on the left."
          />
        )}
      </div>
    </kit.Section>
  );
}
