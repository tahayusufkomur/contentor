"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { EndCard } from "@/components/reels/end-card";
import { Button } from "@/components/ui/button";
import {
  captionAt,
  clock,
  groups,
  nextPlayable,
  onReel,
  phraseAt,
  reelLength,
  toSource,
  upper,
  windowLeft,
  type Span,
} from "@/lib/reels/timeline";
import type { ReelDetail } from "@/types/reels";

const END_MS = 2500;
// Sizes as the render draws them on a 1080 px wide frame (backend/apps/reels/ass.py), in container units.
const at1080 = (px: number) => `${(px / 1080) * 100}cqw`;
// libass sizes a font by its whole line (ascent + descent), CSS by its em: each font's ratio comes with it.
const textAt1080 = (px: number, ratio: number) => at1080(px / (ratio || 1.22));

function outline(px: number, colour: string): string {
  const d = (px / 1080) * 100;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7, 0.7],
    [-0.7, 0.7],
    [0.7, -0.7],
    [-0.7, -0.7],
  ]
    .map(([x, y]) => `${x * d}cqw ${y * d}cqw 0 ${colour}`)
    .join(", ");
}

/** The reel played live from the coach's video: the 9:16 window following the face (or the whole frame on a
 *  blurred copy), the pauses skipped, the words lighting up, the title, the progress bar, photo cutaways and
 *  the end card, as the render will draw them. No file is made until the coach asks for one. */
export function ReelPreview({ reel }: { reel: ReelDetail }) {
  const t = useTranslations("admin.reels.preview");
  const video = useRef<HTMLVideoElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [now, setNow] = useState(reel.start);
  const [playing, setPlaying] = useState(false);
  const [ending, setEnding] = useState(false);
  const [muted, setMuted] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);

  const keep = reel.keep as Span[];
  const length = reelLength(keep);
  const fit = reel.frame.layout === "fit";
  const share = aspect ? Math.min(1, 9 / 16 / aspect) : reel.frame.share;
  const runs = useMemo(
    () =>
      groups(
        reel.words.filter((w) => w[1] > reel.start && w[0] < reel.end),
        reel.style,
      ),
    [reel.words, reel.start, reel.end, reel.style],
  );

  const drawBackdrop = useCallback(() => {
    const v = video.current;
    const canvas = backdrop.current;
    const ctx = canvas?.getContext("2d");
    if (!fit || !v || !canvas || !ctx || !v.videoWidth) return;
    const scale = Math.max(
      canvas.width / v.videoWidth,
      canvas.height / v.videoHeight,
    );
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    ctx.drawImage(v, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }, [fit]);

  const rewind = useCallback(() => {
    const v = video.current;
    if (v) v.currentTime = reel.start;
    setNow(reel.start);
  }, [reel.start]);

  // A trim moves the start: show the new first frame.
  useEffect(() => {
    if (!playing) rewind();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stretch moves
  }, [reel.start]);

  useEffect(() => () => clearTimeout(endTimer.current), []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = () => {
      const v = video.current;
      if (!v) return;
      const at = v.currentTime;
      const next = nextPlayable(at, reel.start, keep);
      if (next === null) {
        v.pause();
        setPlaying(false);
        if (reel.options.end_card) {
          setEnding(true);
          endTimer.current = setTimeout(() => {
            setEnding(false);
            rewind();
          }, END_MS);
        } else rewind();
        return;
      }
      if (next - at > 0.05) v.currentTime = next;
      setNow(at);
      drawBackdrop();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, keep, reel.start, reel.options.end_card, drawBackdrop, rewind]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
      return;
    }
    clearTimeout(endTimer.current);
    setEnding(false);
    if (
      v.currentTime < reel.start ||
      nextPlayable(v.currentTime, reel.start, keep) === null
    )
      v.currentTime = reel.start;
    v.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };

  const seek = (fraction: number) => {
    const v = video.current;
    if (!v) return;
    setEnding(false);
    v.currentTime = toSource(fraction * length, reel.start, keep);
    setNow(v.currentTime);
  };

  const reelNow = onReel(now, reel.start, keep);
  const language = reel.translation
    ? reel.options.language
    : reel.source.language;
  const shown = (text: string) =>
    reel.style === "bold" ? upper(text, language) : text;

  const fonts = reel.brand.fonts;
  const captionStyle: CSSProperties = {
    fontFamily: `'${fonts.caption.family}', system-ui, sans-serif`,
    fontWeight: fonts.caption.weight,
    color: "#ffffff",
    lineHeight: 1.25,
    ...(reel.style === "bold"
      ? {
          fontSize: textAt1080(86, fonts.caption.ratio),
          letterSpacing: at1080(1),
          textShadow: `${outline(7, "#000")}, 0 ${at1080(3)} ${at1080(2)} rgba(0,0,0,.5)`,
        }
      : reel.style === "brand"
        ? {
            fontSize: textAt1080(76, fonts.caption.ratio),
            textShadow: outline(8, reel.brand.edge),
          }
        : {
            fontSize: textAt1080(62, fonts.caption.ratio),
            background: "rgba(0,0,0,.62)",
            padding: `0 ${at1080(14)}`,
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }),
  };
  const lit: CSSProperties = {
    color: reel.brand.highlight,
    ...(reel.style === "bold"
      ? { display: "inline-block", transform: "scale(1.12)" }
      : {}),
  };

  let caption: ReactNode = null;
  if (reel.translation) {
    const line = reelNow === null ? null : phraseAt(reel.translation, reelNow);
    if (line) caption = <span style={captionStyle}>{shown(line)}</span>;
  } else {
    const found = captionAt(runs, now, reel.end);
    if (found)
      caption = (
        <span style={captionStyle}>
          {found.words.map((word, i) => (
            <span key={i}>
              {i ? " " : ""}
              <span style={i === found.active ? lit : undefined}>
                {shown(word)}
              </span>
            </span>
          ))}
        </span>
      );
  }

  const cutaway =
    reel.options.cutaways && reelNow !== null
      ? reel.cutaways.find((c) => reelNow >= c.start && reelNow < c.end)
      : undefined;

  let videoStyle: CSSProperties;
  if (fit) {
    videoStyle = {
      left: 0,
      top: "50%",
      width: "100%",
      transform: "translateY(-50%)",
    };
  } else if (share >= 0.999) {
    videoStyle = {
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
    };
  } else {
    const left = windowLeft(reel.frame.keys, now - reel.start, share);
    videoStyle = {
      top: 0,
      left: 0,
      height: "100%",
      width: "auto",
      maxWidth: "none",
      transform: `translateX(${-left * 100}%)`,
    };
  }

  return (
    <div className="space-y-3">
      <div
        aria-label={t("label")}
        className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-xl bg-black [container-type:inline-size]"
      >
        {fit ? (
          <canvas
            ref={backdrop}
            width={54}
            height={96}
            className="absolute inset-0 h-full w-full scale-110 blur-xl brightness-90"
          />
        ) : null}
        <video
          ref={video}
          src={reel.source.url}
          playsInline
          muted={muted}
          preload="auto"
          className="absolute"
          style={videoStyle}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight)
              setAspect(v.videoWidth / v.videoHeight);
            v.currentTime = reel.start;
          }}
          onSeeked={drawBackdrop}
          onLoadedData={drawBackdrop}
        />
        {cutaway ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
          <img
            src={cutaway.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        {reel.options.title && reel.title ? (
          <div
            className="absolute inset-x-0 flex justify-center text-center"
            style={{
              top: fit ? "15.6%" : "12%",
              padding: `0 ${at1080(110)}`,
              textWrap: "balance",
            }}
          >
            <span
              style={{
                fontFamily: `'${fonts.title.family}', Georgia, serif`,
                fontWeight: 700,
                fontSize: textAt1080(60, fonts.title.ratio),
                lineHeight: 1.55,
                color: reel.brand.colors.primaryForeground || "#fff",
                background: reel.brand.colors.primary || "#111",
                padding: `${at1080(6)} ${at1080(20)}`,
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
              }}
            >
              {reel.title}
            </span>
          </div>
        ) : null}
        {caption ? (
          <div
            className="absolute inset-x-0 text-center"
            style={{
              bottom: fit ? "22.9%" : "31.25%",
              padding: `0 ${at1080(90)}`,
              // libass's smart wrapping evens its lines out
              textWrap: "balance",
            }}
          >
            {caption}
          </div>
        ) : null}
        {reel.options.progress && reelNow !== null ? (
          <div
            className="absolute bottom-0 left-0"
            style={{
              height: at1080(12),
              width: `${Math.min(100, (reelNow / Math.max(length, 0.1)) * 100)}%`,
              background: reel.brand.highlight,
            }}
          />
        ) : null}
        {ending ? (
          <div className="absolute inset-0">
            <EndCard card={reel.end_card} />
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-[340px] items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={toggle}
          aria-label={playing ? t("pause") : t("play")}
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <button
          type="button"
          aria-label={t("seek")}
          className="relative h-2 flex-1 cursor-pointer rounded-full bg-muted"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            seek((e.clientX - box.left) / box.width);
          }}
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{
              width: `${Math.min(100, ((reelNow ?? 0) / Math.max(length, 0.1)) * 100)}%`,
            }}
          />
        </button>
        <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
          {clock(reelNow ?? 0)} / {clock(length)}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? t("unmute") : t("mute")}
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
