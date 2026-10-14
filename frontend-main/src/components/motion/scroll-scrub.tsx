"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { bandOpacity, scrubTime, type Band } from "@/lib/scrub-bands";
import { cn } from "@/lib/utils";

export interface ScrubBand extends Band {
  node: ReactNode;
}

export interface ScrollScrubProps {
  /** All-keyframe mp4 (Phase 1 encodes scrub clips with -g 1). */
  src: string;
  poster: string;
  width: number;
  height: number;
  bands: ScrubBand[];
  /** Track height in viewport heights; the stage is sticky inside it. */
  vh?: number;
  className?: string;
}

function Caption({
  band,
  progress,
}: {
  band: ScrubBand;
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, (p) => bandOpacity(p, band));
  return (
    <motion.div
      style={{ opacity }}
      className="pointer-events-none absolute inset-x-0 bottom-[12%] mx-auto max-w-text px-6 text-center"
    >
      {band.node}
    </motion.div>
  );
}

/** A sticky stage inside a tall track: scroll progress drives the video's
 * playhead and the caption bands (spec 5.2). Reduced motion: the poster and
 * all bands in reading order, static, no track. */
export function ScrollScrub({
  src,
  poster,
  width,
  height,
  bands,
  vh = 3,
  className,
}: ScrollScrubProps) {
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [near, setNear] = useState(false);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Load the clip one screen before the track arrives, not on page load.
  useEffect(() => {
    const el = track.current;
    if (!el || reduced) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && (setNear(true), io.disconnect()),
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const v = video.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const t = scrubTime(p, v.duration);
    if (Math.abs(v.currentTime - t) >= 1 / 30) v.currentTime = t;
  });

  if (reduced) {
    return (
      <div ref={track} className={cn("relative", className)}>
        <figure className="relative mx-auto max-w-media px-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF poster, no optimisation wanted */}
          <img
            src={poster}
            alt=""
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            className="w-full rounded-tile bg-muted"
          />
          <ol className="mx-auto mt-8 max-w-text space-y-4 text-center">
            {bands.map((band, i) => (
              <li key={i}>{band.node}</li>
            ))}
          </ol>
        </figure>
      </div>
    );
  }

  return (
    <div
      ref={track}
      style={{ height: `${vh * 100}vh` }}
      className={cn("relative", className)}
    >
      <div className="sticky top-0 flex h-screen items-center">
        <div className="relative mx-auto w-full max-w-media px-6">
          <video
            ref={video}
            muted
            playsInline
            preload={near ? "auto" : "none"}
            poster={poster}
            width={width}
            height={height}
            src={near ? src : undefined}
            className="w-full rounded-tile bg-muted"
          />
          {bands.map((band, i) => (
            <Caption key={i} band={band} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </div>
  );
}
