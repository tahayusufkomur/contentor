import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { InlineText } from "./inline-text";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function CtaBlock({ data, editable }: BlockComponentProps) {
  if (!editable && !data.heading) return null;
  const layout = data.layout || "centered";

  const button = data.buttonText && data.buttonHref && (
    <Button asChild size="lg" className="gap-2">
      <Link href={data.buttonHref}>
        {data.buttonText}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );

  // Banner: filled primary band with heading + button side by side.
  if (layout === "banner") {
    return (
      <section className="px-4 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-3xl bg-primary px-8 py-12 text-center text-primary-foreground sm:flex-row sm:justify-between sm:text-left">
          <InlineText
            as="h2"
            className="font-display text-2xl font-bold tracking-tight md:text-3xl"
            value={data.heading}
            field="heading"
            editable={editable}
            placeholder="Your call to action"
          />
          {button && <div className="shrink-0">{button}</div>}
        </div>
      </section>
    );
  }

  // Split: heading left, button right (on the page background).
  if (layout === "split") {
    return (
      <section className="py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 sm:flex-row sm:justify-between sm:text-left">
          <InlineText
            as="h2"
            className="font-display text-3xl font-bold tracking-tight md:text-4xl"
            value={data.heading}
            field="heading"
            editable={editable}
            placeholder="Your call to action"
          />
          {button && <div className="shrink-0">{button}</div>}
        </div>
      </section>
    );
  }

  // Centered (default).
  return (
    <section className="py-20">
      <div className="mx-auto max-w-2xl px-4 text-center">
        <InlineText
          as="h2"
          className="font-display text-3xl font-bold tracking-tight md:text-4xl"
          value={data.heading}
          field="heading"
          editable={editable}
          placeholder="Your call to action"
        />
        {button && <div className="mt-8">{button}</div>}
      </div>
    </section>
  );
}
