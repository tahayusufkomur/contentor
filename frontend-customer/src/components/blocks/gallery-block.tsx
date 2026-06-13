import type { BlockComponentProps } from "@/lib/blocks/types";

interface GalleryItem {
  image?: { url: string | null };
  caption?: string;
}

export function GalleryBlock({ data }: BlockComponentProps) {
  const items: GalleryItem[] = (data.items ?? []).filter((it: GalleryItem) => it?.image?.url);
  if (!items.length) return null;
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <figure key={i} className="overflow-hidden rounded-xl border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image!.url!} alt={item.caption || ""} className="h-56 w-full object-cover" />
              {item.caption && (
                <figcaption className="px-4 py-3 text-sm text-muted-foreground">{item.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
