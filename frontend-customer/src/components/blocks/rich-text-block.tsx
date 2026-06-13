import type { BlockComponentProps } from "@/lib/blocks/types";

export function RichTextBlock({ data }: BlockComponentProps) {
  if (!data.heading && !data.body) return null;
  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4">
        {data.heading && (
          <h2 className="font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
        )}
        {data.body && (
          <div className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">
            {data.body}
          </div>
        )}
      </div>
    </section>
  );
}
