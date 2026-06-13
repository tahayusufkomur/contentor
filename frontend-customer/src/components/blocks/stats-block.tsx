import type { BlockComponentProps } from "@/lib/blocks/types";

interface StatItem {
  value?: string;
  label?: string;
}

export function StatsBlock({ data }: BlockComponentProps) {
  const items: StatItem[] = (data.items ?? []).filter((it: StatItem) => it?.value || it?.label);
  if (!items.length) return null;
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
            {data.heading}
          </h2>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border bg-background p-6 text-center">
              <div className="font-display text-4xl font-bold tabular-nums text-primary">{item.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
