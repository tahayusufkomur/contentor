import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";
import { EditableBody } from "./editable-body";
import { headingClasses } from "@/lib/blocks/style";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function ImageTextBlock({ data, editable }: BlockComponentProps) {
  const img = data.image?.url as string | undefined;
  const layout = data.layout || "split";
  const imageLeft = data.imagePosition === "left";
  const level = data.headingLevel || "h2";
  if (!editable && !data.heading && !data.body && !img) return null;

  const text = (
    <div
      className={cn(
        "flex-1",
        layout === "stacked" && "mx-auto max-w-3xl text-center",
      )}
    >
      {(data.heading || editable) && (
        <InlineText
          as={level}
          className={headingClasses(level)}
          value={data.heading}
          field="heading"
          editable={editable}
          placeholder="Heading"
        />
      )}
      {(data.body || editable) && (
        <EditableBody
          className="mt-4 leading-relaxed text-foreground/90"
          value={data.body}
          field="body"
          editable={editable}
          placeholder="Click to add text"
        />
      )}
    </div>
  );

  // Stacked: image on top, centered text below.
  if (layout === "stacked") {
    return (
      <section className="py-16">
        <div className="mx-auto max-w-5xl space-y-10 px-4">
          {img && (
            <div className="w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={data.heading || ""}
                loading="lazy"
                className="max-h-[26rem] w-full rounded-2xl object-cover"
              />
            </div>
          )}
          {text}
        </div>
      </section>
    );
  }

  // Card: image + text inside an elevated, bordered card.
  if (layout === "card") {
    return (
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div
            className={cn(
              "flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm",
              img && (imageLeft ? "md:flex-row-reverse" : "md:flex-row"),
            )}
          >
            <div className="flex flex-1 flex-col justify-center p-8 md:p-12">
              {text}
            </div>
            {img && (
              <div className="md:flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt={data.heading || ""}
                  loading="lazy"
                  className="h-full max-h-[28rem] w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Split (default): text + image side by side.
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
          {text}
          {img && (
            <div className="flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={data.heading || ""}
                loading="lazy"
                className="max-h-80 w-full rounded-2xl object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
