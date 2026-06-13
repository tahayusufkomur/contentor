import { cn } from "@/lib/utils";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function ImageTextBlock({ data }: BlockComponentProps) {
  const img = data.image?.url as string | undefined;
  const imageLeft = data.imagePosition === "left";
  if (!data.heading && !data.body && !img) return null;
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div
          className={cn(
            "flex flex-col gap-10",
            img && "md:items-center",
            img && (imageLeft ? "md:flex-row-reverse" : "md:flex-row"),
          )}
        >
          <div className="flex-1">
            {data.heading && (
              <h2 className="font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
            )}
            {data.body && (
              <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">
                {data.body}
              </p>
            )}
          </div>
          {img && (
            <div className="flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={data.heading || ""} className="max-h-80 w-full rounded-2xl object-cover" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
