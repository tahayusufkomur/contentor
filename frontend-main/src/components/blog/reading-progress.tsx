"use client";

import { useEffect, useState } from "react";
import { ProgressLine } from "@/components/ui/progress-line";
import { readingProgress } from "@/lib/reading-progress";

/** Height of the sticky marketing header (Phase 0: h-12). */
const HEADER_PX = 48;

/** A 2 px ink line under the header that fills as the element `targetId`
 * scrolls past (spec 5.5). Measured on scroll and resize in one rAF; no
 * layout cost (transform only). Labelled so it never reads as "Loading". */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      setValue(readingProgress(r.top, r.height, window.innerHeight, HEADER_PX));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [targetId]);

  return (
    <ProgressLine
      value={value}
      label="Reading progress"
      className="fixed inset-x-0 top-12 z-40 h-0.5 bg-transparent"
    />
  );
}
