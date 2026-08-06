"use client";

import { useEffect, type RefObject } from "react";

/** Publishes how far down from the viewport top the given chrome element
 * reaches (its bottom edge, clamped to ≥0) as `--topnav-clearance` on the
 * root element. Floating UI — the copilot drawer — reads it to start below
 * the navbar instead of overlaying it. Page content is untouched: in-flow
 * spacing already handles it. Sticky, fixed and scroll-away (absolute)
 * navbars all measure correctly because the value tracks the live rect on
 * scroll and resize. Cleared when the publisher unmounts. */
export function usePublishTopnavClearance(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty(
        "--topnav-clearance",
        `${Math.max(0, Math.ceil(el.getBoundingClientRect().bottom))}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      root.style.removeProperty("--topnav-clearance");
    };
  }, [ref]);
}
