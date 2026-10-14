"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REVEAL_SELECTOR =
  "[data-public-page] > [data-block-id]:not(:first-child), main > div > section:not(:first-child)";
const STAGGER_GROUP_SELECTOR =
  "[data-public-page] [data-block-id] :is(ul, ol, .grid)";

/**
 * Progressive, reduced-motion-safe fluidity for public tenant sites:
 * 1. Soft image unveil: marks in-flight `<img>` elements with `data-img-loading`
 *    until `load`/`error` (never touches already-complete/cached images).
 * 2. One-way scroll reveal: marks below-the-fold sections with
 *    `data-reveal="pending"` and flips to `"visible"` on viewport entry, with
 *    subtle `--stagger-idx` delays on child cards/items.
 *
 * Skips entirely when `prefers-reduced-motion: reduce` is active (including
 * `site_qa` headless captures).
 */
export function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const main = document.querySelector("main");
    if (!main) return;

    // 1. Stagger index on card grids / lists inside sections
    const groups = main.querySelectorAll<HTMLElement>(STAGGER_GROUP_SELECTOR);
    groups.forEach((group) => {
      Array.from(group.children)
        .slice(0, 8)
        .forEach((child, idx) => {
          if (child instanceof HTMLElement) {
            child.style.setProperty("--stagger-idx", String(idx));
          }
        });
    });

    // 2. Soft image unveil for images still downloading
    const cleanups: (() => void)[] = [];
    const bindImage = (img: HTMLImageElement) => {
      if (img.complete || img.dataset.siteImg === "priority") {
        delete img.dataset.imgLoading;
        return;
      }
      img.dataset.imgLoading = "";
      const done = () => {
        delete img.dataset.imgLoading;
      };
      const timer = window.setTimeout(done, 1800);
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      cleanups.push(() => {
        window.clearTimeout(timer);
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
      });
    };

    main.querySelectorAll<HTMLImageElement>("img").forEach(bindImage);

    // 3. One-way scroll reveal for below-the-fold sections
    const fold = window.innerHeight * 0.92;
    const sections = Array.from(
      main.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            entry.target.dataset.reveal = "visible";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );

    for (const section of sections) {
      if (section.dataset.reveal === "visible") continue;
      const rect = section.getBoundingClientRect();
      if (rect.top > fold) {
        section.dataset.reveal = "pending";
        observer.observe(section);
      } else {
        section.dataset.reveal = "visible";
      }
    }

    return () => {
      observer.disconnect();
      cleanups.forEach((fn) => fn());
    };
  }, [pathname]);

  return null;
}
