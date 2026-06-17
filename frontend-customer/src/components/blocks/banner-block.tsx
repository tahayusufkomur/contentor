import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InlineText } from "./inline-text";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function BannerBlock({ data, editable }: BlockComponentProps) {
  if (!editable && !data.text) return null;
  const layout = data.layout || "bar";

  const inner = (
    <>
      <InlineText
        as="span"
        className="text-sm font-medium"
        value={data.text}
        field="text"
        editable={editable}
        placeholder="Announcement"
      />
      {data.linkText && data.linkHref && (
        <Link
          href={data.linkHref}
          className="inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
        >
          {data.linkText}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </>
  );

  // Full: edge-to-edge primary strip.
  if (layout === "full") {
    return (
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 py-3 text-center">
          {inner}
        </div>
      </section>
    );
  }

  // Soft: muted, bordered band.
  if (layout === "soft") {
    return (
      <section className="px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border bg-muted px-6 py-4 text-center text-foreground">
          {inner}
        </div>
      </section>
    );
  }

  // Bar (default): rounded primary band.
  return (
    <section className="px-4 py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl bg-primary px-6 py-4 text-center text-primary-foreground">
        {inner}
      </div>
    </section>
  );
}
