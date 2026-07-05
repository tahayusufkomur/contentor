import { Building2 } from "lucide-react";
import { BlockPlaceholder } from "./block-placeholder";
import type { BlockComponentProps } from "@/lib/blocks/types";

interface LogoItem {
  image?: { url: string | null };
  alt?: string;
}

const LOGO_IMG =
  "h-10 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0";

export function LogosBlock({ data, editable }: BlockComponentProps) {
  const items: LogoItem[] = (data.items ?? []).filter(
    (it: LogoItem) => it?.image?.url,
  );
  if (!items.length)
    return editable ? (
      <BlockPlaceholder
        icon={Building2}
        title="No logos yet"
        description="Add logos from the editor panel on the left."
      />
    ) : null;
  const layout = data.layout || "row";

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        {data.heading && (
          <p className="mb-8 text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {data.heading}
          </p>
        )}
        {layout === "grid" ? (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-center bg-background p-8"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image!.url!}
                  alt={item.alt || ""}
                  loading="lazy"
                  className={LOGO_IMG}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
            {items.map((item, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={item.image!.url!}
                alt={item.alt || ""}
                loading="lazy"
                className={LOGO_IMG}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
