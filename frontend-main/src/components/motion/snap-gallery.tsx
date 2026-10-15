"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SnapGalleryProps {
  /** Accessible name of the carousel. */
  label: string;
  items: { key: string; node: ReactNode }[];
  /** Width of one slide, e.g. "w-[320px] md:w-[420px]". */
  itemClassName?: string;
}

/** Horizontal scroll-snap gallery (spec 5.2): native scrolling, arrow
 * buttons, dots, keyboard through the focusable slides. No JS motion. */
export function SnapGallery({ label, items, itemClassName }: SnapGalleryProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [atEnd, setAtEnd] = useState(false);

  // Slide i snaps at i × step: scroll-padding equals the gutter, so slide 0
  // sits at scrollLeft 0 on any screen width.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const step = first
        ? first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0")
        : 1;
      setIndex(Math.round(el.scrollLeft / step));
      setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = scroller.current;
    const child = el?.children[i] as HTMLElement | undefined;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !child || !first) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left: child.offsetLeft - first.offsetLeft,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const last = items.length - 1;
  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="relative"
    >
      <ul
        ref={scroller}
        tabIndex={0}
        aria-label={label}
        className="flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:scroll-px-[max(24px,calc((100vw-1440px)/2))] md:px-[max(24px,calc((100vw-1440px)/2))]"
      >
        {items.map((item, i) => (
          <li
            key={item.key}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className={cn("shrink-0 snap-start", itemClassName)}
          >
            {item.node}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label="Previous"
          disabled={index <= 0}
          onClick={() => goTo(index - 1)}
          className="inline-flex size-9 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center">
          {items.map((item, i) => (
            // A 24 px target (WCAG 2.5.8) around a 6 px dot.
            <button
              key={item.key}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => goTo(i)}
              className="group inline-flex size-6 items-center justify-center"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i === index
                    ? "bg-foreground"
                    : "bg-border group-hover:bg-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next"
          disabled={atEnd || index >= last}
          onClick={() => goTo(index + 1)}
          className="inline-flex size-9 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
