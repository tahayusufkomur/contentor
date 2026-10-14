"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "../lib/utils";

export interface MediaVideoProps {
  src: string;
  poster: string;
  width: number;
  height: number;
  /** Smaller encode for phones; the browser picks it via <source media>. */
  phoneSrc?: string;
  /** VP9 twin; listed first so browsers that can take it do. */
  webm?: string;
  loop?: boolean;
  /** Pause/play control for content that moves longer than 5 s (WCAG 2.2.2). */
  showToggle?: boolean;
  /** Set when the clip carries meaning; omit for decoration. */
  label?: string;
  className?: string;
}

type NavWithSaveData = Navigator & { connection?: { saveData?: boolean } };

/** Poster first, file after idle, play only in view (ported from Pix4Less's
 * hero: spec 5.2). The poster is a plain <img> with explicit size so the
 * layout never shifts; posters are already sized AVIF. */
export function MediaVideo({
  src,
  poster,
  width,
  height,
  phoneSrc,
  webm,
  loop = true,
  showToggle = true,
  label,
  className,
}: MediaVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [wanted, setWanted] = useState(false); // user or idle asked for the file
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // reduced motion / save-data

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = Boolean((navigator as NavWithSaveData).connection?.saveData);
    if (reduced || saveData) {
      setBlocked(true);
      return;
    }
    const start = () => setWanted(true);
    if (document.readyState === "complete") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(start, { timeout: 1500 });
        return () => window.cancelIdleCallback(id);
      }
      const t = setTimeout(start, 300);
      return () => clearTimeout(t);
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v || !wanted) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [wanted]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!wanted) setWanted(true);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <figure className={cn("relative overflow-hidden bg-muted", className)} style={{ aspectRatio: `${width} / ${height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF poster, no optimisation wanted */}
      <img
        src={poster}
        alt=""
        width={width}
        height={height}
        decoding="async"
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-expo",
          playing && "opacity-0",
        )}
      />
      {!blocked && (
        <video
          ref={video}
          muted
          playsInline
          loop={loop}
          preload="none"
          width={width}
          height={height}
          aria-label={label}
          aria-hidden={label ? undefined : true}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="absolute inset-0 h-full w-full object-cover"
        >
          {wanted && phoneSrc && <source src={phoneSrc} media="(max-width: 767px)" type="video/mp4" />}
          {wanted && webm && <source src={webm} type="video/webm" />}
          {wanted && <source src={src} type="video/mp4" />}
        </video>
      )}
      {!blocked && showToggle && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause video" : "Play video"}
          className="absolute bottom-3 right-3 inline-flex size-8 items-center justify-center rounded-full bg-background text-foreground backdrop-blur-sm transition-colors hover:bg-accent"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
      )}
    </figure>
  );
}
