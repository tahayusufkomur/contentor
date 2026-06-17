import type { BlockComponentProps } from "@/lib/blocks/types";

interface TestimonialItem {
  name?: string;
  text?: string;
  avatar?: { url: string | null };
}

function Avatar({
  item,
  size = "h-9 w-9",
}: {
  item: TestimonialItem;
  size?: string;
}) {
  return item.avatar?.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.avatar.url}
      alt={item.name || ""}
      className={`${size} rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary`}
    >
      {(item.name || "?").charAt(0)}
    </div>
  );
}

export function TestimonialsBlock({ data }: BlockComponentProps) {
  const items: TestimonialItem[] = data.items ?? [];
  if (!items.length) return null;
  const layout = data.layout || "cards";

  const heading = data.heading && (
    <h2 className="mb-12 text-center font-display text-3xl font-bold tracking-tight">
      {data.heading}
    </h2>
  );

  // Large quote: one centered quote per row, big display type.
  if (layout === "quote") {
    return (
      <section className="bg-brand-surface py-16">
        <div className="mx-auto max-w-3xl space-y-12 px-4">
          {heading}
          {items.map((item, i) => (
            <figure key={i} className="text-center">
              <blockquote className="font-display text-2xl font-medium leading-relaxed md:text-3xl">
                &ldquo;{item.text}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center justify-center gap-3">
                <Avatar item={item} />
                <span className="text-sm font-medium">{item.name}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  // List: stacked rows, avatar beside the quote.
  if (layout === "list") {
    return (
      <section className="bg-brand-surface py-16">
        <div className="mx-auto max-w-3xl space-y-6 px-4">
          {heading}
          {items.map((item, i) => (
            <div key={i} className="flex gap-4 rounded-xl border bg-background p-6">
              <div className="shrink-0">
                <Avatar item={item} size="h-11 w-11" />
              </div>
              <div>
                <p className="leading-relaxed text-muted-foreground">
                  &ldquo;{item.text}&rdquo;
                </p>
                <p className="mt-2 text-sm font-medium">{item.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Cards (default): responsive card grid.
  return (
    <section className="bg-brand-surface py-16">
      <div className="mx-auto max-w-7xl px-4">
        {heading}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={i} className="space-y-4 rounded-xl border bg-background p-6">
              <p className="leading-relaxed text-muted-foreground">
                &ldquo;{item.text}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <Avatar item={item} />
                <span className="text-sm font-medium">{item.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
