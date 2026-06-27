import { BarChart3 } from "lucide-react";
import { BlockPlaceholder } from "./block-placeholder";
import type { BlockComponentProps } from "@/lib/blocks/types";

interface StatItem {
  value?: string;
  label?: string;
}

export function StatsBlock({ data, editable }: BlockComponentProps) {
  const items: StatItem[] = (data.items ?? []).filter(
    (it: StatItem) => it?.value || it?.label,
  );
  if (!items.length)
    return editable ? (
      <BlockPlaceholder
        icon={BarChart3}
        title="No stats yet"
        description="Add your first stat from the editor panel on the left."
      />
    ) : null;
  const layout = data.layout || "cards";

  const heading = data.heading && (
    <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
      {data.heading}
    </h2>
  );

  // Band: stats inside a filled primary panel.
  if (layout === "band") {
    return (
      <section className="px-4 py-16">
        <div className="mx-auto max-w-7xl rounded-3xl bg-primary px-6 py-12 text-primary-foreground">
          {data.heading && (
            <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
              {data.heading}
            </h2>
          )}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-4xl font-bold tabular-nums">
                  {item.value}
                </div>
                <div className="mt-1 text-sm opacity-80">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Plain: borderless figures in a row.
  if (layout === "plain") {
    return (
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          {heading}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-4xl font-bold tabular-nums text-primary">
                  {item.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Cards (default).
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {heading}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border bg-background p-6 text-center"
            >
              <div className="font-display text-4xl font-bold tabular-nums text-primary">
                {item.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
