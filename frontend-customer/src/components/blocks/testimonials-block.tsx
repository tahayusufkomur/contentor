import { Quote, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlockPlaceholder } from "./block-placeholder";
import type { BlockComponentProps } from "@/lib/blocks/types";

interface TestimonialItem {
  name?: string;
  text?: string;
  role?: string;
  rating?: string;
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
      loading="lazy"
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

function Stars({ rating }: { rating?: string }) {
  const n = Number(rating) || 0;
  if (n < 1) return null;
  return (
    <div className="flex gap-0.5" aria-label={`Rated ${n} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i < n
              ? "fill-primary text-primary"
              : "fill-transparent text-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

function NameLine({ item }: { item: TestimonialItem }) {
  return (
    <div>
      <span className="text-sm font-medium">{item.name}</span>
      {item.role && (
        <span className="block text-xs text-muted-foreground">{item.role}</span>
      )}
    </div>
  );
}

export function TestimonialsBlock({ data, editable }: BlockComponentProps) {
  const items: TestimonialItem[] = data.items ?? [];
  if (!items.length)
    return editable ? (
      <BlockPlaceholder
        icon={Quote}
        title="No testimonials yet"
        description="Add your first testimonial from the editor panel on the left."
      />
    ) : null;
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
              {item.rating && (
                <div className="mb-4 flex justify-center">
                  <Stars rating={item.rating} />
                </div>
              )}
              <blockquote className="font-display text-2xl font-medium leading-relaxed md:text-3xl">
                &ldquo;{item.text}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center justify-center gap-3">
                <Avatar item={item} />
                <NameLine item={item} />
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
            <div
              key={i}
              className="flex gap-4 rounded-xl border bg-background p-6"
            >
              <div className="shrink-0">
                <Avatar item={item} size="h-11 w-11" />
              </div>
              <div>
                {item.rating && (
                  <div className="mb-1.5">
                    <Stars rating={item.rating} />
                  </div>
                )}
                <p className="leading-relaxed text-muted-foreground">
                  &ldquo;{item.text}&rdquo;
                </p>
                <p className="mt-2 text-sm font-medium">
                  {item.name}
                  {item.role && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {item.role}
                    </span>
                  )}
                </p>
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
            <div
              key={i}
              className="space-y-4 rounded-xl border bg-background p-6"
            >
              {item.rating && <Stars rating={item.rating} />}
              <p className="leading-relaxed text-muted-foreground">
                &ldquo;{item.text}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <Avatar item={item} />
                <NameLine item={item} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
