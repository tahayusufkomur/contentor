import type { LandingTestimonials } from "@/types/tenant";

export function TestimonialsSection({ data }: { data: LandingTestimonials }) {
  if (!data.enabled || !data.items?.length) return null;
  return (
    <section className="py-16 bg-brand-surface">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="font-display text-3xl font-bold tracking-tight text-center mb-12">
          {data.heading}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border bg-background p-6 space-y-4"
            >
              <p className="text-muted-foreground leading-relaxed">
                "{item.text}"
              </p>
              <div className="flex items-center gap-3">
                {item.avatar_url ? (
                  <img
                    src={item.avatar_url}
                    alt={item.name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {item.name.charAt(0)}
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
