"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
  /** Set when the clip carries meaning; omit for decoration. In "hover" mode it
   * names the focusable tile, so set it. */
  label?: string;
  /** "view" (default): the file loads after idle and plays while in view.
   * "hover": nothing loads until the pointer enters or the tile is focused; a
   * tap or Enter/Space toggles. A reader without a pointer pays for the poster
   * only (landing bento tiles, spec 5.4 ch. 4). */
  playOn?: "view" | "hover";
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
  playOn = "view",
  className,
}: MediaVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [wanted, setWanted] = useState(false); // user, idle or hover asked for the file
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false); // reduced motion / save-data
  const [hovering, setHovering] = useState(false);
  const hover = playOn === "hover";

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = Boolean((navigator as NavWithSaveData).connection?.saveData);
    if (reduced || saveData) {
      setBlocked(true);
      return;
    }
    if (hover) return; // loads on the first hover instead of after idle
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
  }, [hover]);

  useEffect(() => {
    const v = video.current;
    if (!v || !wanted || hover) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [wanted, hover]);

  // Hover mode: the <source> elements appear once `wanted` flips, so play from
  // an effect (after that commit) rather than from the pointer handler.
  useEffect(() => {
    const v = video.current;
    if (!v || !hover || !wanted) return;
    if (hovering) v.play().catch(() => {});
    else v.pause();
  }, [hover, hovering, wanted]);

  const toggle = () => {
    if (hover) {
      setWanted(true);
      setHovering((h) => !h);
      return;
    }
    const v = video.current;
    if (!v) return;
    if (!wanted) setWanted(true);
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const enter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return; // touch toggles on pointerup
    setWanted(true);
    setHovering(true);
  };
  const leave = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return;
    setHovering(false);
  };
  const tap = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") toggle();
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  const interactive = hover && !blocked;

  return (
    <figure
      className={cn(
        "relative overflow-hidden bg-muted",
        interactive && "cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}` }}
      {...(interactive
        ? {
            tabIndex: 0,
            role: "button",
            "aria-label": label,
            "aria-pressed": playing,
            onPointerEnter: enter,
            onPointerLeave: leave,
            onPointerUp: tap,
            onFocus: () => {
              setWanted(true);
              setHovering(true);
            },
            onBlur: () => setHovering(false),
            onKeyDown: key,
          }
        : {})}
    >
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
          aria-label={hover ? undefined : label}
          aria-hidden={hover || !label ? true : undefined}
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
          className="absolute bottom-3 right-3 inline-flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
      )}
    </figure>
  );
}
