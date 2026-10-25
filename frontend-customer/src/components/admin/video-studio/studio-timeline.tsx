"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Captions, Film, Image as ImageIcon, Images, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { gaps, pieces, snap, stamp } from "@/lib/reels/studio";
import { clock, groups, toSource, type Span } from "@/lib/reels/timeline";
import type { ReelDetail } from "@/types/reels";

export type Selection =
  | { kind: "piece"; a: number; b: number }
  | { kind: "gap"; a: number; b: number; manual: boolean }
  | { kind: "caption"; index: number }
  | { kind: "photo"; photo: string }
  | { kind: "cover" }
  | { kind: "end" };

export const LABELS = 44; // px of the track names' column
const END_SECONDS = 2.5; // the end card's time after the clip (backend/apps/reels/render.py END_SECONDS)
const COVER_SECONDS = 1;
const SNAP_PX = 8;
const TICKS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const MOST_TILES = 160; // stills on the filmstrip

interface Props {
  reel: ReelDetail;
  /** The stretch of the video the timeline shows, its seconds. */
  lo: number;
  hi: number;
  /** Pixels a second. */
  pps: number;
  now: number;
  selected: Selection | null;
  splits: number[];
  scroller: React.RefObject<HTMLDivElement>;
  onSeek: (t: number) => void;
  onSelect: (s: Selection | null) => void;
  /** A trim handle dragged (`done` once it is let go). */
  onTrim: (edge: "start" | "end", t: number, done: boolean) => void;
  /** A photo dragged along the clip. */
  onMovePhoto: (photo: string, at: number, done: boolean) => void;
}

/** The reel on the video's clock, a track for each of its parts, like a video editor's: its cover, the clip
 *  (a filmstrip, the pieces it keeps and the gaps it skips, a handle at each end), its captions, its photos
 *  and its end card, with the playhead across them. Click to select or to move the playhead; drag the ends to
 *  trim (they snap to words; hold Alt not to) and a photo to move it. */
export function StudioTimeline({
  reel,
  lo,
  hi,
  pps,
  now,
  selected,
  splits,
  scroller,
  onSeek,
  onSelect,
  onTrim,
  onMovePhoto,
}: Props) {
  const t = useTranslations("admin.reels.studio");
  const x = (at: number) => (at - lo) * pps;
  const width = Math.max(1, (hi - lo) * pps);
  const keep = reel.keep as Span[];
  const cuts = reel.edits.cuts;
  const kept = useMemo(
    () => pieces(reel.start, keep, splits),
    [reel.start, keep, splits],
  );
  const skipped = useMemo(
    () => gaps(reel.start, reel.end, keep, cuts ?? []),
    [reel.start, reel.end, keep, cuts],
  );
  const inside = useMemo(
    () => reel.words.filter((w) => w[1] > reel.start && w[0] < reel.end),
    [reel.words, reel.start, reel.end],
  );
  const captions = useMemo(
    () => groups(inside, reel.style),
    [inside, reel.style],
  );
  const coverFrom = toSource(0, reel.start, keep);
  const coverTo = toSource(COVER_SECONDS, reel.start, keep);
  const photos = reel.cutaways.map((c) => ({
    ...c,
    from: toSource(c.start, reel.start, keep),
    to: toSource(c.end, reel.start, keep),
  }));

  // The time under the pointer, from the track area's left edge.
  const timeAt = (clientX: number) => {
    const box = scroller.current?.getBoundingClientRect();
    const left =
      (box?.left ?? 0) + LABELS - (scroller.current?.scrollLeft ?? 0);
    return Math.min(hi, Math.max(lo, lo + (clientX - left) / pps));
  };

  // A drag on the ruler or an empty stretch of a track moves the playhead.
  const scrub = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(timeAt(e.clientX));
    const move = (ev: PointerEvent) => onSeek(timeAt(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // A click on an empty stretch of a track lets go of what was selected.
  const empty = (e: ReactPointerEvent) => {
    onSelect(null);
    scrub(e);
  };

  const trim = (edge: "start" | "end") => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent | ReactPointerEvent) =>
      ev.altKey
        ? +timeAt(ev.clientX).toFixed(2)
        : snap(timeAt(ev.clientX), reel.words, SNAP_PX / pps, edge);
    const move = (ev: PointerEvent) => onTrim(edge, at(ev), false);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onTrim(edge, at(ev), true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const dragPhoto = (photo: string, from: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    const x0 = e.clientX;
    let moved = false;
    const at = (ev: PointerEvent) =>
      +Math.min(
        reel.end - END_SECONDS,
        Math.max(reel.start, from + (ev.clientX - x0) / pps),
      ).toFixed(2);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) < 3 && !moved) return;
      moved = true;
      onMovePhoto(photo, at(ev), false);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) onMovePhoto(photo, at(ev), true);
      else onSelect({ kind: "photo", photo });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const is = (s: Selection) =>
    selected !== null && JSON.stringify(selected) === JSON.stringify(s);

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={t("timeline")}
      className="relative h-full overflow-x-auto overflow-y-hidden overscroll-x-contain select-none"
    >
      <div className="relative h-full" style={{ width: width + LABELS + 24 }}>
        {/* The track names stay put while the tracks scroll under them. */}
        <div
          className="sticky left-0 z-20 flex h-full flex-col border-r bg-background"
          style={{ width: LABELS }}
        >
          <div className="h-6 border-b" />
          <TrackName
            icon={<ImageIcon />}
            label={t("tracks.cover")}
            className="h-7"
          />
          <TrackName
            icon={<Film />}
            label={t("tracks.video")}
            className="h-16"
          />
          <TrackName
            icon={<Captions />}
            label={t("tracks.captions")}
            className="h-9"
          />
          <TrackName
            icon={<Images />}
            label={t("tracks.photos")}
            className="h-9"
          />
          <TrackName icon={<Flag />} label={t("tracks.end")} className="h-7" />
        </div>

        <div className="absolute inset-y-0" style={{ left: LABELS, width }}>
          <Ruler lo={lo} hi={hi} pps={pps} onPointerDown={scrub} />

          {/* cover */}
          <Track className="h-7" onPointerDown={empty}>
            <Block
              left={x(coverFrom)}
              width={(coverTo - coverFrom) * pps}
              selected={is({ kind: "cover" })}
              off={!reel.options.cover}
              tone="bg-chart-4/25 border-chart-4"
              onSelect={() => onSelect({ kind: "cover" })}
            >
              {t("tracks.cover")}
            </Block>
          </Track>

          {/* the clip */}
          <Track className="h-16" onPointerDown={empty}>
            <Filmstrip
              src={reel.source.url}
              lo={lo}
              hi={hi}
              pps={pps}
              aspect={
                reel.source.width && reel.source.height
                  ? reel.source.width / reel.source.height
                  : 16 / 9
              }
            />
            {/* outside the reel's stretch: dimmed */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
              style={{ width: Math.max(0, x(reel.start)) }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 bg-background/70"
              style={{ left: x(reel.end), right: 0 }}
            />
            {kept.map((p) => (
              <button
                key={`${p.a}-${p.b}`}
                type="button"
                aria-label={t("piece", { from: clock(p.a), to: clock(p.b) })}
                aria-pressed={is({ kind: "piece", ...p })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onSelect({ kind: "piece", ...p });
                  onSeek(p.a);
                }}
                className={cn(
                  "absolute inset-y-1 rounded-md border-2 border-primary/70 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                  is({ kind: "piece", ...p })
                    ? "border-primary bg-primary/20 ring-2 ring-primary"
                    : "hover:bg-primary/10",
                )}
                style={{ left: x(p.a), width: Math.max(2, (p.b - p.a) * pps) }}
              />
            ))}
            {skipped.map((g) => (
              <button
                key={`gap-${g.a}`}
                type="button"
                aria-label={g.manual ? t("cut") : t("pauseCut")}
                title={g.manual ? t("cut") : t("pauseCut")}
                aria-pressed={is({ kind: "gap", ...g })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect({ kind: "gap", ...g })}
                className={cn(
                  "absolute inset-y-1 rounded-sm border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                  g.manual
                    ? "border-destructive/60 bg-[repeating-linear-gradient(135deg,var(--destructive)_0_2px,transparent_2px_7px)] opacity-80"
                    : "border-transparent bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_1px,transparent_1px_6px)] opacity-60",
                  is({ kind: "gap", ...g }) &&
                    "ring-2 ring-destructive opacity-100",
                )}
                style={{ left: x(g.a), width: Math.max(4, (g.b - g.a) * pps) }}
              />
            ))}
            <Handle
              left={x(reel.start)}
              value={reel.start}
              label={t("trimStart")}
              edge="start"
              onPointerDown={trim("start")}
              onNudge={(by) =>
                onTrim("start", +(reel.start + by).toFixed(2), true)
              }
            />
            <Handle
              left={x(reel.end)}
              value={reel.end}
              label={t("trimEnd")}
              edge="end"
              onPointerDown={trim("end")}
              onNudge={(by) => onTrim("end", +(reel.end + by).toFixed(2), true)}
            />
          </Track>

          {/* captions */}
          <Track className="h-9" onPointerDown={empty}>
            {captions.map((run, i) => (
              <Block
                key={`${run[0][0]}`}
                left={x(run[0][0])}
                width={(run[run.length - 1][1] - run[0][0]) * pps}
                selected={is({ kind: "caption", index: i })}
                tone="bg-chart-2/20 border-chart-2"
                onSelect={() => {
                  onSelect({ kind: "caption", index: i });
                  onSeek(run[0][0]);
                }}
              >
                {run.map((w) => w[2].trim()).join(" ")}
              </Block>
            ))}
          </Track>

          {/* photos over the clip */}
          <Track className="h-9" onPointerDown={empty}>
            {reel.options.cutaways
              ? photos.map((p) => (
                  <button
                    key={p.photo}
                    type="button"
                    aria-label={t("photoAt", { at: clock(p.from) })}
                    aria-pressed={is({ kind: "photo", photo: p.photo })}
                    onPointerDown={dragPhoto(p.photo, p.at)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        onSelect({ kind: "photo", photo: p.photo });
                    }}
                    className={cn(
                      "absolute inset-y-1 cursor-grab overflow-hidden rounded-md border-2 border-chart-5 bg-chart-5/20 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                      is({ kind: "photo", photo: p.photo }) &&
                        "ring-2 ring-chart-5",
                    )}
                    style={{
                      left: x(p.from),
                      width: Math.max(8, (p.to - p.from) * pps),
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
                    <img
                      src={p.url}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover opacity-80"
                    />
                  </button>
                ))
              : null}
          </Track>

          {/* end card */}
          <Track className="h-7" onPointerDown={empty}>
            <Block
              left={x(reel.end)}
              width={END_SECONDS * pps}
              selected={is({ kind: "end" })}
              off={!reel.options.end_card}
              tone="bg-chart-3/25 border-chart-3"
              onSelect={() => onSelect({ kind: "end" })}
            >
              {t("tracks.end")}
            </Block>
          </Track>

          {/* split marks and the playhead */}
          {splits.map((s) => (
            <div
              key={s}
              className="pointer-events-none absolute bottom-0 top-6 w-px bg-foreground/60"
              style={{ left: x(s) }}
            />
          ))}
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-foreground"
            style={{ left: x(now) }}
          >
            <div className="absolute -left-[5px] top-0 h-3 w-3 rotate-45 rounded-[2px] bg-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackName({
  icon,
  label,
  className,
}: {
  icon: ReactNode;
  label: string;
  className: string;
}) {
  return (
    <div
      title={label}
      className={cn(
        "flex items-center justify-center border-b text-muted-foreground [&_svg]:h-4 [&_svg]:w-4",
        className,
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function Track({
  className,
  children,
  onPointerDown,
}: {
  className: string;
  children: ReactNode;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      className={cn("relative border-b", className)}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}

function Block({
  left,
  width,
  selected,
  off,
  tone,
  onSelect,
  children,
}: {
  left: number;
  width: number;
  selected: boolean;
  off?: boolean;
  tone: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onSelect}
      className={cn(
        "absolute inset-y-1 truncate rounded-md border px-1.5 text-left text-[11px] font-medium leading-none text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        tone,
        off && "border-dashed opacity-45",
        selected && "ring-2 ring-foreground",
      )}
      style={{ left, width: Math.max(6, width) }}
    >
      {children}
    </button>
  );
}

/** A trim handle: dragged, or moved a tenth of a second (a second with Shift) by the arrow keys. */
function Handle({
  left,
  value,
  label,
  edge,
  onPointerDown,
  onNudge,
}: {
  left: number;
  value: number;
  label: string;
  edge: "start" | "end";
  onPointerDown: (e: ReactPointerEvent) => void;
  onNudge: (by: number) => void;
}) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuetext={clock(value)}
      title={label}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        onNudge((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1));
      }}
      className={cn(
        "absolute inset-y-0 z-[5] flex w-3 cursor-ew-resize items-center justify-center bg-primary text-primary-foreground touch-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        edge === "start" ? "-translate-x-full rounded-l-md" : "rounded-r-md",
      )}
      style={{ left }}
    >
      <span className="h-5 w-0.5 rounded-full bg-primary-foreground/80" />
    </div>
  );
}

/** Seconds along the top: a tick every few, as far apart as the zoom leaves room for. */
function Ruler({
  lo,
  hi,
  pps,
  onPointerDown,
}: {
  lo: number;
  hi: number;
  pps: number;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const step = TICKS.find((s) => s * pps >= 64) ?? 120;
  const ticks: number[] = [];
  for (let at = Math.ceil(lo / step) * step; at <= hi; at += step)
    ticks.push(at);
  return (
    <div
      className="relative h-6 cursor-pointer border-b bg-muted/40"
      onPointerDown={onPointerDown}
    >
      {ticks.map((at) => (
        <span
          key={at}
          className="absolute bottom-0 flex h-full items-end border-l border-foreground/25 pb-0.5 pl-1 text-[10px] tabular-nums text-muted-foreground"
          style={{ left: (at - lo) * pps }}
        >
          {step < 1 ? stamp(at) : clock(at)}
        </span>
      ))}
    </div>
  );
}

/** Stills of the video along the clip's track, drawn from a hidden copy of it one after another. Redrawn
 *  when the zoom settles. */
const Filmstrip = memo(function Filmstrip({
  src,
  lo,
  hi,
  pps,
  aspect,
}: {
  src: string;
  lo: number;
  hi: number;
  pps: number;
  aspect: number;
}) {
  const HEIGHT = 56;
  const tile = HEIGHT * aspect;
  // a still per tile's width of the video, or fewer and wider ones (cropped) when zoomed far in
  const step = Math.max(tile / pps, (hi - lo) / MOST_TILES);
  const count = Math.max(1, Math.ceil((hi - lo) / step));
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const [settled, setSettled] = useState({ step, count, lo });

  useEffect(() => {
    const timer = setTimeout(() => setSettled({ step, count, lo }), 300);
    return () => clearTimeout(timer);
  }, [step, count, lo]);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = src;
    const seek = (at: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done);
        video.currentTime = at;
      });
    const draw = async () => {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) resolve();
        else
          video.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
      });
      for (let i = 0; i < settled.count && !cancelled; i++) {
        await seek(
          Math.min(
            video.duration || Infinity,
            settled.lo + (i + 0.5) * settled.step,
          ),
        );
        const canvas = canvases.current[i];
        const ctx = canvas?.getContext("2d");
        if (cancelled || !canvas || !ctx) continue;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    };
    draw().catch(() => undefined);
    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, settled]);

  return (
    <div className="pointer-events-none absolute inset-y-1 left-0 flex overflow-hidden rounded-sm bg-muted">
      {Array.from({ length: settled.count }, (_, i) => (
        <canvas
          key={i}
          ref={(el) => {
            canvases.current[i] = el;
          }}
          width={Math.max(1, Math.round(tile))}
          height={HEIGHT}
          className="h-full shrink-0 border-r border-background/40 object-cover"
          style={{ width: settled.step * pps }}
        />
      ))}
    </div>
  );
});
