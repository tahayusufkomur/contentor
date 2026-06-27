"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function BannerBlock({ data, editable }: BlockComponentProps) {
  const dismissible = !!data.dismissible;
  const storageKey = `contentor:banner-dismissed:${data.id}`;
  const [dismissed, setDismissed] = useState(false);

  // Restore a prior dismissal for visitors. The coach always sees the banner in
  // edit mode (and dismissing there is a no-op) so it stays editable.
  useEffect(() => {
    if (!dismissible || editable) return;
    try {
      if (localStorage.getItem(storageKey) === "1") setDismissed(true);
    } catch {}
  }, [dismissible, editable, storageKey]);

  if (!editable && !data.text) return null;
  if (dismissed && !editable) return null;
  const layout = data.layout || "bar";

  const handleDismiss = () => {
    if (editable) return; // preview only while editing
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
  };

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

  const closeButton = dismissible && (
    <button
      type="button"
      onClick={handleDismiss}
      aria-label="Dismiss announcement"
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <X className="h-4 w-4" />
    </button>
  );

  // Full: edge-to-edge primary strip.
  if (layout === "full") {
    return (
      <section className="relative bg-primary text-primary-foreground">
        <div
          className={cn(
            "mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 py-3 text-center",
            dismissible && "px-12",
          )}
        >
          {inner}
        </div>
        {closeButton}
      </section>
    );
  }

  // Soft: muted, bordered band.
  if (layout === "soft") {
    return (
      <section className="px-4 py-4">
        <div
          className={cn(
            "relative mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border bg-muted px-6 py-4 text-center text-foreground",
            dismissible && "px-12",
          )}
        >
          {inner}
          {closeButton}
        </div>
      </section>
    );
  }

  // Bar (default): rounded primary band.
  return (
    <section className="px-4 py-4">
      <div
        className={cn(
          "relative mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl bg-primary px-6 py-4 text-center text-primary-foreground",
          dismissible && "px-12",
        )}
      >
        {inner}
        {closeButton}
      </div>
    </section>
  );
}
