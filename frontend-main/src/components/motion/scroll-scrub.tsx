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

/** The scrub clips' frame rate: SCRUB_FPS in scripts/footage/encode.sh. */
const SCRUB_FPS = 10;

/** A sticky stage inside a tall track: scroll progress drives the video's
 * playhead and the caption bands (spec 5.2). The stage sits under the sticky
 * LocalNav and the video fits the height left. Reduced motion is the
 * caller's: pair it with a static figure switched by CSS (`motion-safe:`), so
 * the server-rendered track never collapses after hydration. */
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
  const [near, setNear] = useState(false);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start start", "end end"],
  });

  // Load the clip one screen before the track arrives, not on page load.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && (setNear(true), io.disconnect()),
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One seek in flight at a time: a scroll during a seek is picked up on
  // `seeked` from the latest progress; `loadedmetadata` places a reload
  // mid-track on its frame.
  const seek = () => {
    const v = video.current;
    if (!v || v.seeking || !Number.isFinite(v.duration)) return;
    const t = scrubTime(scrollYProgress.get(), v.duration, SCRUB_FPS);
    if (Math.abs(v.currentTime - t) >= 0.5 / SCRUB_FPS) v.currentTime = t;
  };
  useMotionValueEvent(scrollYProgress, "change", seek);

  return (
    <div
      ref={track}
      style={{ height: `${vh * 100}vh` }}
      className={cn("relative", className)}
    >
      <div className="sticky top-[var(--localnav-h)] flex h-[calc(100vh-var(--localnav-h))] items-center">
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
            onSeeked={seek}
            onLoadedMetadata={seek}
            style={{
              aspectRatio: `${width} / ${height}`,
              width: `min(100%, (100vh - var(--localnav-h) - 2rem) * ${width / height})`,
            }}
            className="mx-auto block h-auto rounded-tile bg-muted"
          />
          {bands.map((band, i) => (
            <Caption key={i} band={band} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </div>
  );
}
