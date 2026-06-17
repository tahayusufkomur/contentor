import type { BlockComponentProps } from "@/lib/blocks/types";

interface GalleryItem {
  image?: { url: string | null };
  caption?: string;
}

export function GalleryBlock({ data }: BlockComponentProps) {
  const items: GalleryItem[] = (data.items ?? []).filter(
    (it: GalleryItem) => it?.image?.url,
  );
  if (!items.length) return null;
  const layout = data.layout || "grid";

  const caption = (text?: string) =>
    text && (
      <figcaption className="px-4 py-3 text-sm text-muted-foreground">
        {text}
      </figcaption>
    );

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}

        {layout === "carousel" ? (
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
            {items.map((item, i) => (
              <figure
                key={i}
                className="w-72 shrink-0 snap-start overflow-hidden rounded-xl border bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image!.url!}
                  alt={item.caption || ""}
                  className="h-56 w-full object-cover"
                />
                {caption(item.caption)}
              </figure>
            ))}
          </div>
        ) : layout === "masonry" ? (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {items.map((item, i) => (
              <figure
                key={i}
                className="mb-4 break-inside-avoid overflow-hidden rounded-xl border bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image!.url!}
                  alt={item.caption || ""}
                  className="w-full object-cover"
                />
                {caption(item.caption)}
              </figure>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <figure
                key={i}
                className="overflow-hidden rounded-xl border bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image!.url!}
                  alt={item.caption || ""}
                  className="h-56 w-full object-cover"
                />
                {caption(item.caption)}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
