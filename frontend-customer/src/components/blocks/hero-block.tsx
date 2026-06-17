import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { InlineText } from "./inline-text";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function HeroBlock({ data, editable }: BlockComponentProps) {
  const bg = data.bgImage?.url as string | undefined;
  const layout =
    data.layout === "split" || data.layout === "minimal"
      ? data.layout
      : "centered";

  const heading = (
    <InlineText
      as="h1"
      className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl"
      value={data.heading}
      field="heading"
      editable={editable}
      placeholder="Your headline"
    />
  );
  const subheading = (data.subheading || editable) && (
    <InlineText
      as="p"
      className="mt-5 text-lg text-muted-foreground md:text-xl"
      value={data.subheading}
      field="subheading"
      editable={editable}
      placeholder="Add a subheadline"
    />
  );
  const button = data.ctaText && data.ctaHref && (
    <Button asChild size="lg" className="mt-8 gap-2">
      <Link href={data.ctaHref}>
        {data.ctaText}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );

  // Split: text on the left, image on the right.
  if (layout === "split") {
    return (
      <section className="py-16 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 md:grid-cols-2">
          <div className="text-left">
            {heading}
            {subheading}
            {button}
          </div>
          {bg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bg}
              alt={data.heading || ""}
              className="max-h-[28rem] w-full rounded-2xl object-cover"
            />
          ) : (
            <div className="aspect-[4/3] w-full rounded-2xl bg-muted" />
          )}
        </div>
      </section>
    );
  }

  // Minimal: left-aligned text, no image.
  if (layout === "minimal") {
    return (
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-left">
          {heading}
          {subheading}
          {button}
        </div>
      </section>
    );
  }

  // Centered (default): full-bleed background image with an overlay.
  return (
    <section
      className="relative flex min-h-[60vh] flex-col items-center justify-center py-20 text-center"
      style={
        bg
          ? {
              backgroundImage: `url(${bg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {bg && (
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      )}
      <div className="relative z-10 mx-auto max-w-3xl px-4">
        {heading}
        {subheading}
        {button}
      </div>
    </section>
  );
}
