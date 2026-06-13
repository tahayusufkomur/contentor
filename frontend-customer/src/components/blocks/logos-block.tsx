import type { BlockComponentProps } from "@/lib/blocks/types";

interface LogoItem {
  image?: { url: string | null };
  alt?: string;
}

export function LogosBlock({ data }: BlockComponentProps) {
  const items: LogoItem[] = (data.items ?? []).filter((it: LogoItem) => it?.image?.url);
  if (!items.length) return null;
  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <p className="mb-8 text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {data.heading}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {items.map((item, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={item.image!.url!}
              alt={item.alt || ""}
              className="h-10 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
