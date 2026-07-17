"use client";

import { useEffect, useRef, useState } from "react";

interface CounterProps {
  /** Final string, e.g. "$19", "100%", "5 min". */
  value: string;
  /** Animation duration in ms. */
  duration?: number;
  className?: string;
}

/**
 * Counts up a leading numeric portion in `value` when it enters view, then
 * settles on the original string. Non-numeric suffixes ("+", "min", "M+")
 * are preserved exactly. If no leading number is found, renders `value` as-is.
 */
export function Counter({ value, duration = 1400, className }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    const match = value.match(/^(\D*)([\d,.]+)(.*)$/);
    if (!match) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = match;
    const isFloat = numStr.includes(".");
    const target = parseFloat(numStr.replace(/,/g, ""));
    if (!isFinite(target)) {
      setDisplay(value);
      return;
    }

    const formatter = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: isFloat ? 1 : 0,
    });

    let raf = 0;
    let started = false;
    const startCount = (time: number) => {
      const start = time;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const current = target * eased;
        setDisplay(`${prefix}${formatter.format(current)}${suffix}`);
        if (t < 1) raf = requestAnimationFrame(tick);
        else setDisplay(value);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          raf = requestAnimationFrame(startCount);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
