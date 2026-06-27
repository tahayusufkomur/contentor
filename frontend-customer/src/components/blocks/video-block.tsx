import { cn } from "@/lib/utils";
import { Video } from "lucide-react";
import { BlockPlaceholder } from "./block-placeholder";
import type { BlockComponentProps } from "@/lib/blocks/types";

function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export function VideoBlock({ data, editable }: BlockComponentProps) {
  const url = data.video?.url as string | undefined;
  if (!url)
    return editable ? (
      <BlockPlaceholder
        icon={Video}
        title="No video yet"
        description="Paste a YouTube or Vimeo link, or pick a library video, on the left."
      />
    ) : null;
  const embed = toEmbedUrl(url);
  const layout = data.layout || "standard";
  const width =
    layout === "full" ? "max-w-none" : layout === "wide" ? "max-w-6xl" : "max-w-4xl";
  const frame = layout === "full" ? "" : "rounded-2xl border";

  return (
    <section className="py-16">
      <div className={cn("mx-auto px-4", width)}>
        {data.heading && (
          <h2 className="mb-8 text-center font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}
        <div className={cn("aspect-video overflow-hidden bg-black", frame)}>
          {embed ? (
            <iframe
              src={embed}
              title={data.heading || "Video"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} controls className="h-full w-full" />
          )}
        </div>
      </div>
    </section>
  );
}
