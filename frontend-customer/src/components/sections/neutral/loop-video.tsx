"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlayChoice = "auto" | "play" | "pause";

/** Whether the clip plays now. The visitor's own choice wins; until she makes
 *  one it plays only on screen and only when motion is welcome. */
export function shouldPlay(s: {
  reducedMotion: boolean;
  visible: boolean;
  choice: PlayChoice;
}): boolean {
  if (s.choice === "pause") return false;
  if (s.choice === "play") return s.visible;
  return s.visible && !s.reducedMotion;
}

/** Her clip, muted, on a loop. The server renders a still poster (no
 *  autoplay attribute, nothing loaded before it nears the screen), and a
 *  pause button stays in reach (WCAG 2.2.2). */
export function LoopVideo({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster?: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  // Until the browser says otherwise, assume reduced motion: never start by itself.
  const [reducedMotion, setReducedMotion] = useState(true);
  const [choice, setChoice] = useState<PlayChoice>("auto");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const play = shouldPlay({ reducedMotion, visible, choice });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (play) el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [play]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius)] bg-muted",
        className,
      )}
    >
      {/* Muted and wordless: a moving picture of her at work, so no caption track. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        // Nothing loads until it nears the screen; then its first frame stands in for a missing poster.
        preload={visible ? "metadata" : "none"}
        aria-label={label}
        className="absolute inset-0 h-full w-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={() => {
          // In the tap itself: a browser that refused to start it on its own lets her start it.
          const el = ref.current;
          setChoice(playing ? "pause" : "play");
          if (!el) return;
          if (playing) el.pause();
          else el.play().catch(() => setPlaying(false));
        }}
        aria-label={playing ? "Pause video" : "Play video"}
        className="absolute bottom-3 right-3 inline-flex size-11 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--background)_88%,transparent)] text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {playing ? (
          <Pause aria-hidden="true" className="size-5" />
        ) : (
          <Play aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  );
}
