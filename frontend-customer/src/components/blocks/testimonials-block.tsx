import type { BlockComponentProps } from "@/lib/blocks/types";

interface TestimonialItem {
  name?: string;
  text?: string;
  avatar?: { url: string | null };
}

export function TestimonialsBlock({ data }: BlockComponentProps) {
  const items: TestimonialItem[] = data.items ?? [];
  if (!items.length) return null;
  return (
    <section className="bg-brand-surface py-16">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <h2 className="mb-12 text-center font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={i} className="space-y-4 rounded-xl border bg-background p-6">
              <p className="leading-relaxed text-muted-foreground">&ldquo;{item.text}&rdquo;</p>
              <div className="flex items-center gap-3">
                {item.avatar?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.avatar.url} alt={item.name || ""} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {(item.name || "?").charAt(0)}
                  </div>
                )}
                <span className="text-sm font-medium">{item.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
