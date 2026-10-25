"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Captions,
  Crop,
  Download,
  Image as ImageIcon,
  ImageDown,
  Maximize2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  FileText,
} from "lucide-react";
import { BOLD_FONT, MakeHint } from "@/components/admin/reels/reel-editor";
import {
  CaptionFields,
  CoverFields,
  ExtrasFields,
  FramingFields,
  PostFields,
  Section,
} from "@/components/admin/reels/reel-fields";
import {
  ReelPreview,
  type ReelPreviewHandle,
} from "@/components/admin/reels/reel-preview";
import { useReel, type ReelEditing } from "@/components/admin/reels/use-reel";
import {
  LABELS,
  StudioTimeline,
  type Selection,
} from "@/components/admin/video-studio/studio-timeline";
import { StudioTranscript } from "@/components/admin/video-studio/studio-transcript";
import { CoverFonts } from "@/components/reels/reel-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";
import { plainHook } from "@/lib/reels/cover";
import { addCut, merged, pieces, restore, stamp } from "@/lib/reels/studio";
import {
  centreAt,
  clock,
  groups,
  onReel,
  reelLength,
  type Span,
} from "@/lib/reels/timeline";
import type { ReelDetail, Word } from "@/types/reels";

type Panel = "words" | "cover" | "captions" | "frame" | "extras" | "post";
const PANELS: { id: Panel; icon: ReactNode }[] = [
  { id: "words", icon: <FileText /> },
  { id: "cover", icon: <ImageIcon /> },
  { id: "captions", icon: <Captions /> },
  { id: "frame", icon: <Crop /> },
  { id: "extras", icon: <SlidersHorizontal /> },
  { id: "post", icon: <Type /> },
];
const AROUND = 30; // seconds of the video either side of the clip on the timeline (the words the server sends)
const MIN_PPS = 4;
const MAX_PPS = 320;
const FRAME = 1 / 30;
// Where the captions sit when she has not moved them (backend/apps/reels/ass.py _MARGINS, over 1920 px).
const CAPTION_AT = { crop: 600 / 1920, fit: 440 / 1920 };

/** While something is dragged, what it would be: shown at once, saved when it is let go. */
interface Draft {
  start?: number;
  end?: number;
  caption_at?: number;
  centre?: number;
  photo?: { photo: string; at: number };
}

function drafted(reel: ReelDetail, draft: Draft): ReelDetail {
  let out = reel;
  if (draft.start !== undefined || draft.end !== undefined)
    out = merged(out, { start: draft.start, end: draft.end });
  if (draft.caption_at !== undefined)
    out = { ...out, edits: { ...out.edits, caption_at: draft.caption_at } };
  if (draft.centre !== undefined)
    out = {
      ...out,
      frame: {
        layout: "crop",
        keys: [[0, draft.centre]],
        share: out.frame.share,
      },
    };
  const moved = draft.photo;
  if (moved)
    out = merged(out, {
      cutaways: out.cutaways.map((c) => ({
        at: c.photo === moved.photo ? moved.at : c.at,
        photo: c.photo,
      })),
    });
  return out;
}

const zoomOf = (v: number) => MIN_PPS * (MAX_PPS / MIN_PPS) ** v;
const sliderOf = (pps: number) =>
  Math.log(pps / MIN_PPS) / Math.log(MAX_PPS / MIN_PPS);

/** One reel in a video editor of its own: the player in the middle (drag its captions up or down, its picture
 *  sideways), the timeline underneath (its cover, the clip with its cuts, the captions, the photos and the
 *  end card — trim, split, cut out, move), and beside it the panels: the reel's words to edit it by its text,
 *  its cover, captions, frame, extras and post. Every change is saved at once and can be undone. */
export function VideoStudio({ initial }: { initial: ReelDetail }) {
  const t = useTranslations("admin.reels.studio");
  const te = useTranslations("admin.reels.editor");
  const tr = useTranslations("admin.reels");
  const editing = useReel(initial);
  const { reel, live, saving, change, undo, redo, canUndo, canRedo } = editing;

  const player = useRef<ReelPreviewHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(initial.start);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [splits, setSplits] = useState<number[]>([]);
  const [panel, setPanel] = useState<Panel>("words");
  const [draft, setDraft] = useState<Draft>({});
  const [pps, setPps] = useState(40);

  const shown = useMemo(() => drafted(live, draft), [live, draft]);
  const latest = useRef(reel);
  latest.current = reel;
  const cuts = reel.edits.cuts ?? [];

  // The timeline's stretch: the clip and what the server sent words for around it, growing with a trim.
  const duration = reel.source.duration || reel.end + AROUND;
  const [lo, setLo] = useState(() => Math.max(0, initial.start - AROUND));
  const [hi, setHi] = useState(() => Math.min(duration, initial.end + AROUND));
  useEffect(() => {
    setLo((v) => Math.min(v, Math.max(0, reel.start - AROUND)));
    setHi((v) => Math.max(v, Math.min(duration, reel.end + AROUND)));
  }, [reel.start, reel.end, duration]);

  const seek = useCallback((at: number) => player.current?.seek(at), []);
  const onTime = useCallback((at: number, isPlaying: boolean) => {
    setNow(at);
    setPlaying(isPlaying);
  }, []);

  // ── the zoom: fitted to the clip at first; a change keeps the playhead where it is on screen ──────────
  const anchor = useRef<{ at: number; offset: number } | null>(null);
  const zoom = useCallback(
    (next: number) => {
      const box = scroller.current;
      const value = Math.min(MAX_PPS, Math.max(MIN_PPS, next));
      if (box) {
        const left = box.scrollLeft;
        const visible =
          (now - lo) * pps >= left &&
          (now - lo) * pps <= left + box.clientWidth;
        const at = visible
          ? now
          : lo + (left + box.clientWidth / 2 - LABELS) / pps;
        anchor.current = { at, offset: (at - lo) * pps - left };
      }
      setPps(value);
    },
    [now, lo, pps],
  );
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || !anchor.current) return;
    box.scrollLeft = (anchor.current.at - lo) * pps - anchor.current.offset;
    anchor.current = null;
  }, [pps, lo]);
  const fit = useCallback(() => {
    const box = scroller.current;
    const r = latest.current;
    if (!box) return;
    const value = Math.min(
      MAX_PPS,
      Math.max(
        MIN_PPS,
        (box.clientWidth - LABELS - 24) / (r.end - r.start + 4),
      ),
    );
    anchor.current = { at: r.start - 2, offset: 0 };
    setPps(value);
  }, []);
  useLayoutEffect(fit, [fit]);

  // ── edits ─────────────────────────────────────────────────────────────────────────────────────────────
  const trim = useCallback(
    (edge: "start" | "end", at: number, done = true) => {
      if (!done) {
        setDraft((d) => ({ ...d, [edge]: at }));
        seek(at);
        return;
      }
      setDraft((d) => ({ ...d, [edge]: undefined }));
      if (Math.abs(at - latest.current[edge]) > 0.005)
        change(edge === "start" ? { start: at } : { end: at });
      seek(edge === "start" ? at : Math.max(latest.current.start, at - 1));
    },
    [change, seek],
  );
  const movePhoto = useCallback(
    (photo: string, at: number, done: boolean) => {
      if (!done) {
        setDraft((d) => ({ ...d, photo: { photo, at } }));
        return;
      }
      setDraft((d) => ({ ...d, photo: undefined }));
      change({
        cutaways: latest.current.cutaways.map((c) => ({
          at: c.photo === photo ? at : c.at,
          photo: c.photo,
        })),
      });
    },
    [change],
  );
  const cutOut = useCallback(
    (a: number, b: number) =>
      change({
        edits: { cuts: addCut(latest.current.edits.cuts ?? [], a, b) },
      }),
    [change],
  );
  const putBack = useCallback(
    (a: number, b: number) =>
      change({
        edits: { cuts: restore(latest.current.edits.cuts ?? [], a, b) },
      }),
    [change],
  );
  const retype = useCallback(
    (word: Word, text: string) => {
      const typed = { ...(latest.current.edits.text ?? {}) };
      const key = String(word[0]);
      if (text.trim()) typed[key] = text.trim();
      else delete typed[key];
      change({ edits: { text: typed } });
    },
    [change],
  );

  const keep = shown.keep as Span[];
  const kept = useMemo(
    () => pieces(reel.start, reel.keep as Span[], splits),
    [reel.start, reel.keep, splits],
  );
  const split = useCallback(() => {
    const at = +now.toFixed(2);
    if (kept.some((p) => at > p.a + 0.1 && at < p.b - 0.1))
      setSplits((s) => (s.includes(at) ? s : [...s, at]));
  }, [now, kept]);

  const removeSelected = useCallback(() => {
    const s = selected;
    const r = latest.current;
    if (!s) return;
    if (s.kind === "piece") cutOut(s.a, s.b);
    else if (s.kind === "gap" && s.manual) putBack(s.a, s.b);
    else if (s.kind === "photo") {
      const left = r.cutaways.filter((c) => c.photo !== s.photo);
      change({
        cutaways: left.map(({ at, photo }) => ({ at, photo })),
        // with none left the photos are off, else they would be looked for again
        ...(left.length ? {} : { options: { cutaways: false } }),
      });
    } else if (s.kind === "cover") change({ options: { cover: false } });
    else if (s.kind === "end") change({ options: { end_card: false } });
    else return;
    setSelected(null);
  }, [selected, cutOut, putBack, change]);

  const select = useCallback((s: Selection | null) => {
    setSelected(s);
    if (s?.kind === "caption") setPanel("captions");
    else if (s?.kind === "cover") setPanel("cover");
    else if (s?.kind === "end" || s?.kind === "photo") setPanel("extras");
  }, []);

  // ── keys: Space plays, S splits, Delete cuts out or removes, arrows step, ⌘Z undoes ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.getAttribute("role") === "slider")
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod || target?.closest("#studio-panel")) {
        return; // (a panel's own buttons and fields keep their keys)
      } else if (e.key === " ") {
        e.preventDefault();
        player.current?.toggle();
      } else if (e.key === "s" || e.key === "S") {
        split();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const by = (e.shiftKey ? 1 : FRAME) * (e.key === "ArrowLeft" ? -1 : 1);
        seek(Math.max(0, now + by));
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, split, removeSelected, seek, now]);

  const length = reelLength(keep);
  const reelNow = onReel(now, shown.start, keep);
  const ready = reel.status === "ready" && !reel.stale;
  const active = useMemo(
    () => reel.words.findIndex((w) => now >= w[0] && now < w[1] + 0.05),
    [reel.words, now],
  );
  const selectedCaption =
    selected?.kind === "caption"
      ? groups(
          shown.words.filter((w) => w[1] > shown.start && w[0] < shown.end),
          shown.style,
        )[selected.index]
      : undefined;
  const canRemove =
    selected !== null &&
    selected.kind !== "caption" &&
    !(selected.kind === "gap" && !selected.manual);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:h-full lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto_244px]">
      <CoverFonts look={reel.brand.look} />
      <link rel="stylesheet" href={BOLD_FONT} />

      {/* ── the top bar ── */}
      <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-2 lg:px-4 lg:py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <NavLink href="/admin/video-studio" aria-label={t("back")}>
              <ArrowLeft className="h-4 w-4" />
            </NavLink>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {plainHook(live.title) || tr("untitled")}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {te("from", { video: reel.video_title })} ·{" "}
              {te("length", { length: clock(length) })}
              {saving ? ` · ${te("saving")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p
            className="hidden max-w-[16rem] text-right text-xs text-muted-foreground xl:block"
            aria-live="polite"
          >
            <MakeHint reel={reel} />
          </p>
          {ready && reel.cover_file ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => editing.downloadCover()}
              loading={editing.fetchingCover}
              className="gap-2"
            >
              <ImageDown className="h-4 w-4" />
              {te("downloadCover")}
            </Button>
          ) : null}
          {ready ? (
            <Button
              size="sm"
              onClick={() => editing.download()}
              loading={editing.fetching}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {te("download")}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => editing.make()}
              loading={editing.starting || reel.status === "rendering"}
              loadingText={te("making")}
              disabled={!reel.render || saving}
            >
              {reel.status === "failed"
                ? te("tryAgain")
                : reel.stale
                  ? te("makeAgain")
                  : te("make")}
            </Button>
          )}
        </div>
      </header>

      {/* ── the player ── */}
      <div className="relative h-[58vh] bg-muted/50 p-4 lg:col-start-2 lg:row-start-2 lg:h-auto lg:min-h-0">
        <div className="flex h-full w-full items-center justify-center [container-type:size]">
          <ReelPreview
            ref={player}
            reel={shown}
            controls={false}
            onTime={onTime}
            stageClassName="w-[min(100cqw,56.25cqh)] max-w-none shadow-xl"
          >
            <StageHandles
              reel={shown}
              now={now}
              captionSelected={
                selected?.kind === "caption" || panel === "captions"
              }
              onToggle={() => player.current?.toggle()}
              onCaption={(at, done) => {
                if (!done) return setDraft((d) => ({ ...d, caption_at: at }));
                setDraft((d) => ({ ...d, caption_at: undefined }));
                change({ edits: { caption_at: at } });
              }}
              onCentre={(centre, done) => {
                if (!done) return setDraft((d) => ({ ...d, centre }));
                setDraft((d) => ({ ...d, centre: undefined }));
                change({ layout: "center", edits: { centre } });
              }}
            />
          </ReelPreview>
        </div>
      </div>

      {/* ── the tools over the timeline ── */}
      <div className="flex flex-wrap items-center gap-1 border-y bg-background px-2 py-1.5 lg:col-span-2 lg:row-start-3">
        <Tool label={t("undo")} keys="⌘Z" onClick={undo} disabled={!canUndo}>
          <Undo2 />
        </Tool>
        <Tool label={t("redo")} keys="⇧⌘Z" onClick={redo} disabled={!canRedo}>
          <Redo2 />
        </Tool>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tool label={t("split")} keys="S" onClick={split}>
          <SplitSquareHorizontal />
        </Tool>
        {selected?.kind === "gap" && selected.manual ? (
          <Tool label={t("putBack")} keys="⌫" onClick={removeSelected} wide>
            <RotateCcw />
          </Tool>
        ) : (
          <Tool
            label={selected?.kind === "piece" ? t("cutOut") : t("remove")}
            keys="⌫"
            onClick={removeSelected}
            disabled={!canRemove}
            wide
          >
            {selected?.kind === "piece" ? <Scissors /> : <Trash2 />}
          </Tool>
        )}

        <div className="mx-auto flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => player.current?.toggle()}
            aria-label={playing ? t("pause") : t("play")}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            <span className="text-foreground">{stamp(reelNow ?? 0)}</span> /{" "}
            {stamp(length)}
          </span>
        </div>

        <Tool label={t("zoomOut")} onClick={() => zoom(pps / 1.5)}>
          <ZoomOut />
        </Tool>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sliderOf(pps)}
          aria-label={t("zoom")}
          onChange={(e) => zoom(zoomOf(Number(e.target.value)))}
          className="hidden w-28 accent-primary sm:block"
        />
        <Tool label={t("zoomIn")} onClick={() => zoom(pps * 1.5)}>
          <ZoomIn />
        </Tool>
        <Tool label={t("fit")} onClick={fit}>
          <Maximize2 />
        </Tool>
      </div>

      {/* ── the timeline ── */}
      <div className="h-[244px] bg-background lg:col-span-2 lg:row-start-4 lg:h-auto">
        <StudioTimeline
          reel={shown}
          lo={lo}
          hi={hi}
          pps={pps}
          now={now}
          selected={selected}
          splits={splits}
          scroller={scroller}
          onSeek={seek}
          onSelect={select}
          onTrim={trim}
          onMovePhoto={movePhoto}
        />
      </div>

      {/* ── the panels ── */}
      <aside className="flex min-h-[28rem] border-t lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:border-r lg:border-t-0">
        <nav
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("panelsLabel")}
          className="flex w-16 shrink-0 flex-col gap-1 border-r bg-muted/40 p-1.5"
        >
          {PANELS.map(({ id, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panel === id}
              aria-controls="studio-panel"
              onClick={() => setPanel(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:h-[18px] [&_svg]:w-[18px]",
                panel === id && "bg-background text-foreground shadow-sm",
              )}
            >
              {icon}
              {t(`panels.${id}`)}
            </button>
          ))}
        </nav>
        <div
          id="studio-panel"
          role="tabpanel"
          className="min-w-0 flex-1 overflow-y-auto"
        >
          {panel === "words" ? (
            <StudioTranscript
              words={shown.words}
              start={shown.start}
              end={shown.end}
              cuts={cuts}
              retyped={reel.edits.text ?? {}}
              active={active}
              onSeek={seek}
              onCut={cutOut}
              onPutBack={putBack}
              onTrim={(edge, at) => trim(edge, at)}
              onRetype={retype}
            />
          ) : (
            <div className="space-y-6 p-4">
              {panel === "cover" ? (
                <Section title={te("cover")} hint={te("coverHint")}>
                  <CoverFields editing={editing} />
                </Section>
              ) : panel === "captions" ? (
                <CaptionPanel
                  editing={editing}
                  group={selectedCaption}
                  onRetype={retype}
                />
              ) : panel === "frame" ? (
                <Section title={te("framing")} hint={t("frame.dragHint")}>
                  <FramingFields editing={editing} />
                  {reel.edits.centre !== undefined ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => change({ edits: { centre: null } })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("frame.reset")}
                    </Button>
                  ) : null}
                </Section>
              ) : panel === "extras" ? (
                <Section title={te("extras")}>
                  <ExtrasFields editing={editing} />
                </Section>
              ) : (
                <PostPanel editing={editing} />
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Tool({
  label,
  keys,
  onClick,
  disabled,
  wide,
  children,
}: {
  label: string;
  keys?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Its name shows beside its icon (from 640 px). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={wide ? "sm" : "icon"}
      className={cn(
        "h-8 [&_svg]:h-4 [&_svg]:w-4",
        wide ? "gap-1.5 px-2" : "w-8",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={keys ? `${label} (${keys})` : label}
    >
      {children}
      {wide ? <span className="hidden sm:inline">{label}</span> : null}
    </Button>
  );
}

/** The captions: their style and language, size and height, and the words of the one selected, to retype. */
function CaptionPanel({
  editing,
  group,
  onRetype,
}: {
  editing: ReelEditing;
  group: Word[] | undefined;
  onRetype: (word: Word, text: string) => void;
}) {
  const t = useTranslations("admin.reels.studio.captions");
  const te = useTranslations("admin.reels.editor");
  const { reel, change } = editing;
  const at = reel.edits.caption_at ?? CAPTION_AT[reel.frame.layout];
  return (
    <>
      <Section title={te("captions")} hint={t("dragHint")}>
        <CaptionFields editing={editing} />
        <Slider
          id="caption-size"
          label={t("size")}
          min={0.6}
          max={1.6}
          value={reel.edits.caption_size ?? 1}
          shown={`${Math.round((reel.edits.caption_size ?? 1) * 100)}%`}
          onCommit={(v) => change({ edits: { caption_size: v } })}
        />
        <Slider
          id="caption-height"
          label={t("position")}
          min={0.05}
          max={0.8}
          value={at}
          shown={`${Math.round(at * 100)}%`}
          onCommit={(v) => change({ edits: { caption_at: v } })}
        />
        {reel.edits.caption_at !== undefined ||
        reel.edits.caption_size !== undefined ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() =>
              change({ edits: { caption_at: null, caption_size: null } })
            }
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("reset")}
          </Button>
        ) : null}
      </Section>
      {group ? (
        <Section title={t("group")} hint={t("groupHint")}>
          <div className="flex flex-wrap gap-2">
            {group.map((word) => (
              <Input
                key={`${word[0]}:${word[2]}`}
                defaultValue={word[2].trim()}
                aria-label={word[2].trim()}
                maxLength={60}
                className="h-8 w-auto min-w-0"
                size={Math.max(4, word[2].trim().length + 2)}
                onBlur={(e) => {
                  if (e.target.value.trim() !== word[2].trim())
                    onRetype(word, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

/** A native range for a number, saved when it is let go. */
function Slider({
  id,
  label,
  min,
  max,
  value,
  shown,
  onCommit,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  shown: string;
  onCommit: (value: number) => void;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  const commit = () => {
    if (moving !== null && Math.abs(moving - value) > 0.001)
      onCommit(+moving.toFixed(3));
    setMoving(null);
  };
  return (
    <div className="max-w-xs space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {shown}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={moving ?? value}
        onChange={(e) => setMoving(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="w-full accent-primary"
      />
    </div>
  );
}

/** The post's text, and the reel's deletion. */
function PostPanel({ editing }: { editing: ReelEditing }) {
  const te = useTranslations("admin.reels.editor");
  const [sure, setSure] = useState(false);
  return (
    <>
      <Section title={te("post")} hint={te("postHint")}>
        <PostFields editing={editing} />
      </Section>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {sure ? (
          <>
            <span className="text-sm">{te("deleteSure")}</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => editing.remove()}
              loading={editing.deleting}
            >
              {te("delete")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSure(false)}>
              {te("keep")}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setSure(true)}
          >
            <Trash2 className="h-4 w-4" />
            {te("delete")}
          </Button>
        )}
      </div>
    </>
  );
}

/** Over the player's frame: drag the captions up or down, the picture sideways (the window then holds still
 *  where she leaves it); a click plays or pauses. */
function StageHandles({
  reel,
  now,
  captionSelected,
  onToggle,
  onCaption,
  onCentre,
}: {
  reel: ReelDetail;
  now: number;
  captionSelected: boolean;
  onToggle: () => void;
  onCaption: (at: number, done: boolean) => void;
  onCentre: (centre: number, done: boolean) => void;
}) {
  const t = useTranslations("admin.reels.studio");
  const [zone, setZone] = useState<"caption" | "picture" | null>(null);
  const [dragging, setDragging] = useState(false);
  const at = reel.edits.caption_at ?? CAPTION_AT[reel.frame.layout];
  const pannable = reel.frame.layout === "crop" && reel.frame.share < 0.999;

  const zoneAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const fromBottom = (box.bottom - e.clientY) / box.height;
    if (fromBottom > at - 0.04 && fromBottom < at + 0.16) return "caption";
    return pannable ? "picture" : null;
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const which = zoneAt(e);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const centre0 = centreAt(reel.frame.keys, now - reel.start);
    const half = reel.frame.share / 2;
    let moved = false;
    const value = (ev: PointerEvent) =>
      which === "caption"
        ? +Math.min(
            0.8,
            Math.max(0.05, at + (y0 - ev.clientY) / box.height),
          ).toFixed(3)
        : +Math.min(
            1 - half,
            Math.max(
              half,
              centre0 - ((ev.clientX - x0) / box.width) * reel.frame.share,
            ),
          ).toFixed(4);
    const send = which === "caption" ? onCaption : onCentre;
    const move = (ev: PointerEvent) => {
      if (!which) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      setDragging(true);
      send(value(ev), false);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (moved && which) send(value(ev), true);
      else onToggle();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={cn(
        "absolute inset-0 touch-none",
        zone === "caption"
          ? "cursor-ns-resize"
          : zone === "picture"
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-pointer",
      )}
      onPointerDown={down}
      onPointerMove={(e) => !dragging && setZone(zoneAt(e))}
      onPointerLeave={() => !dragging && setZone(null)}
      title={t("stageHint")}
    >
      {zone === "caption" || dragging || captionSelected ? (
        <div
          className="pointer-events-none absolute inset-x-[6%] rounded-md border-2 border-dashed border-white/80"
          style={{ bottom: `${(at - 0.02) * 100}%`, height: "15%" }}
        />
      ) : null}
    </div>
  );
}
