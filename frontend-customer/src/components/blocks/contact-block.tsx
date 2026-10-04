"use client";

import { cn } from "@/lib/utils";
import { ContactForm } from "./contact-form";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function ContactBlock({ data }: BlockComponentProps) {
  const layout = data.layout || "centered";

  const header = (align: string) => (
    <>
      {data.heading && (
        <h2
          className={cn(
            "font-display text-3xl font-bold tracking-tight",
            align,
          )}
        >
          {data.heading}
        </h2>
      )}
      {data.intro && (
        <p className={cn("mt-3 text-muted-foreground", align)}>{data.intro}</p>
      )}
    </>
  );

  const body = (
    <ContactForm
      successMessage={data.successMessage}
      submitLabel={data.submitLabel}
    />
  );

  // Split: heading/intro on the left, form on the right.
  if (layout === "split") {
    return (
      <section className="py-16">
        <div className="mx-auto grid max-w-5xl items-start gap-10 px-4 md:grid-cols-2">
          <div>{header("")}</div>
          <div>{body}</div>
        </div>
      </section>
    );
  }

  // Card: form inside an elevated card.
  if (layout === "card") {
    return (
      <section className="py-16">
        <div className="mx-auto max-w-xl px-4">
          {header("text-center")}
          <div className="mt-8 rounded-2xl border bg-card p-8 shadow-sm">
            {body}
          </div>
        </div>
      </section>
    );
  }

  // Centered (default).
  return (
    <section className="py-16">
      <div className="mx-auto max-w-xl px-4">
        {header("text-center")}
        <div className="mt-8">{body}</div>
      </div>
    </section>
  );
}
