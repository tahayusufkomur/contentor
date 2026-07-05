import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";
import type { BlockComponentProps } from "@/lib/blocks/types";

// Fixed scrim layers for the Centered hero's background photo. A photo isn't
// theme-aware, so these are deliberately fixed black/white (the one sanctioned
// non-token colour, like text-white on destructive surfaces).
const DARK_SCRIM: Record<string, string> = {
  light: "bg-black/30",
  medium: "bg-black/50",
  strong: "bg-black/70",
};
const LIGHT_SCRIM: Record<string, string> = {
  light: "bg-white/40",
  medium: "bg-white/60",
  strong: "bg-white/75",
};

export function HeroBlock({ data, editable }: BlockComponentProps) {
  const bg = data.bgImage?.url as string | undefined;
  const layout =
    data.layout === "split" || data.layout === "minimal"
      ? data.layout
      : "centered";

  // Image shade applies only to the Centered full-bleed photo. Defaults to a
  // medium dark scrim so a hero with a photo is readable out of the box; the
  // coach can pick a lighter/stronger shade or turn it off ("none").
  const shade =
    bg && layout === "centered" ? (data.overlay as string) || "dark" : "none";
  const strength = (data.overlayStrength as string) || "medium";
  const scrimClass =
    shade === "dark"
      ? (DARK_SCRIM[strength] ?? DARK_SCRIM.medium)
      : shade === "light"
        ? (LIGHT_SCRIM[strength] ?? LIGHT_SCRIM.medium)
        : null;
  // Auto-flip the hero text for legibility over the scrim. Kept non-important so
  // an explicit "Text color" override (Style panel) still wins over it.
  const headingColor =
    shade === "dark" ? "text-white" : shade === "light" ? "text-black" : "";
  const subColor =
    shade === "dark"
      ? "text-white/80"
      : shade === "light"
        ? "text-black/70"
        : "text-muted-foreground";

  const heading = (
    <InlineText
      as="h1"
      className={cn(
        "font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl",
        headingColor,
      )}
      value={data.heading}
      field="heading"
      editable={editable}
      placeholder="Your headline"
    />
  );
  const subheading = (data.subheading || editable) && (
    <InlineText
      as="p"
      className={cn("mt-5 text-lg md:text-xl", subColor)}
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

  // Centered (default): full-bleed background image with an optional shade.
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
      {scrimClass && <div className={cn("absolute inset-0", scrimClass)} />}
      <div className="relative z-10 mx-auto max-w-3xl px-4">
        {heading}
        {subheading}
        {button}
      </div>
    </section>
  );
}
