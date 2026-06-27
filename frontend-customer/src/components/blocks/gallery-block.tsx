"use client";

import { useCallback, useEffect, useState } from "react";
import { Images, X, ChevronLeft, ChevronRight } from "lucide-react";
import { BlockPlaceholder } from "./block-placeholder";
import type { BlockComponentProps } from "@/lib/blocks/types";

interface GalleryItem {
  image?: { url: string | null };
  caption?: string;
}

export function GalleryBlock({ data, editable }: BlockComponentProps) {
  const items: GalleryItem[] = (data.items ?? []).filter(
    (it: GalleryItem) => it?.image?.url,
  );
  const [lightbox, setLightbox] = useState<number | null>(null);
  const layout = data.layout || "grid";

  const close = useCallback(() => setLightbox(null), []);
  const step = useCallback(
    (delta: number) =>
      setLightbox((i) =>
        i === null ? i : (i + delta + items.length) % items.length,
      ),
    [items.length],
  );

  // Keyboard control for the lightbox (Esc to close, arrows to navigate).
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close, step]);

  if (!items.length)
    return editable ? (
      <BlockPlaceholder
        icon={Images}
        title="No images yet"
        description="Add images from the editor panel on the left."
      />
    ) : null;

  const caption = (text?: string) =>
    text && (
      <figcaption className="px-4 py-3 text-sm text-muted-foreground">
        {text}
      </figcaption>
    );

  // A clickable thumbnail that opens the lightbox at its index.
  const thumb = (item: GalleryItem, i: number, imgClass: string) => (
    <button
      type="button"
      onClick={() => setLightbox(i)}
      aria-label={item.caption ? `Enlarge: ${item.caption}` : "Enlarge image"}
      className="block w-full cursor-zoom-in"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.image!.url!}
        alt={item.caption || ""}
        loading="lazy"
        className={imgClass}
      />
    </button>
  );

  const grid =
    layout === "carousel" ? (
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {items.map((item, i) => (
          <figure
            key={i}
            className="w-72 shrink-0 snap-start overflow-hidden rounded-xl border bg-background"
          >
            {thumb(item, i, "h-56 w-full object-cover")}
            {caption(item.caption)}
          </figure>
        ))}
      </div>
    ) : layout === "masonry" ? (
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((item, i) => (
          <figure
            key={i}
            className="mb-4 break-inside-avoid overflow-hidden rounded-xl border bg-background"
          >
            {thumb(item, i, "w-full object-cover")}
            {caption(item.caption)}
          </figure>
        ))}
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <figure
            key={i}
            className="overflow-hidden rounded-xl border bg-background"
          >
            {thumb(item, i, "h-56 w-full object-cover")}
            {caption(item.caption)}
          </figure>
        ))}
      </div>
    );

  const active = lightbox !== null ? items[lightbox] : null;

  return (
    <>
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4">
          {data.heading && (
            <h2 className="mb-10 text-center font-display text-3xl font-bold tracking-tight">
              {data.heading}
            </h2>
          )}
          {grid}
        </div>
      </section>

      {active && (
        // Full-bleed media overlay — fixed dark backdrop + light text is the
        // sanctioned non-token exception (an image isn't theme-aware).
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {items.length > 1 && (
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          <figure className="max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.image!.url!}
              alt={active.caption || ""}
              className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain"
            />
            {active.caption && (
              <figcaption className="mt-3 text-center text-sm text-white/80">
                {active.caption}
              </figcaption>
            )}
          </figure>
          {items.length > 1 && (
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
