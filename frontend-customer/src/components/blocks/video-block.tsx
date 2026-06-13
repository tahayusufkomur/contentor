import type { BlockComponentProps } from "@/lib/blocks/types";

function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export function VideoBlock({ data }: BlockComponentProps) {
  const url = data.video?.url as string | undefined;
  if (!url) return null;
  const embed = toEmbedUrl(url);
  return (
    <section className="py-16">
      <div className="mx-auto max-w-4xl px-4">
        {data.heading && (
          <h2 className="mb-8 text-center font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
        )}
        <div className="aspect-video overflow-hidden rounded-2xl border bg-black">
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
