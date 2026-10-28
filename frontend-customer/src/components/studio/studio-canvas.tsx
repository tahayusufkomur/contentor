"use client";

// The photo studio's canvas for a computer: the cover drawn live in one size, with an editing layer on
// top. She selects a layer by clicking it, drags it, resizes it by its handles (Shift keeps its shape),
// nudges it with the arrow keys (Shift: further), duplicates it with Cmd-D, deletes it, and double-clicks
// words to type in place. Alt-drag moves the photo inside its frame.
//
// It generalises components/logo/studio-canvas.tsx from three fixed parts to a list of layers. Every
// change leaves as one EditorAction (lib/covers/editor.ts); a drag or a resize is drawn from a copy of the
// recipe while it lasts and sent once, on release, so it is one undo step whatever its length. The
// maths is lib/covers/geometry.ts.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSiteLocale } from "@shared/i18n/site-preview";
import { CoverArt } from "@/components/covers/cover-art";
import { Skeleton } from "@/components/ui/skeleton";
import {
  applyEdit,
  canRemove,
  newExtraId,
  type EditorAction,
} from "@/lib/covers/editor";
import {
  guidesFrom,
  hitTest,
  moveFrame,
  panFocus,
  resizeDrawn,
  resizeFrame,
  snapDrawn,
  type Handle,
} from "@/lib/covers/geometry";
import {
  framesFor,
  layerOrder,
  resolveWords,
  sizeAspect,
} from "@/lib/covers/recipe";
import { MAX_EXTRAS, TEXT_MAX } from "@/types/design";
import type { CoverAspect } from "@shared/sections/types";
import type {
  CoverDesign,
  CoverItem,
  CoverRecipe,
  CoverSize,
  Frame,
} from "@/types/design";

export interface StudioCanvasProps {
  /** What is drawn and edited. */
  recipe: CoverRecipe;
  /** The rest of the cover payload: her photos, her logo and the look. */
  design: Omit<CoverDesign, "recipe">;
  /** The course or event: its own title, and the dates its badge reads. */
  item: CoverItem;
  /** The size drawn and edited; the other sizes keep their own frames. */
  size: CoverSize;
  /** The Card shape of the look. */
  cardAspect: CoverAspect;
  /** The selected layer: a part's id or an extra's. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (action: EditorAction) => void;
  /** A new photo is being made: a shimmer holds the place of its frame. */
  generating?: boolean;
  /** Nothing can be selected or changed (the draft is being kept, discarded or reloaded). */
  disabled?: boolean;
}

/** The studio's own colour for what she has selected, whatever the cover's: a white ring keeps it
 *  readable on a dark or a blue cover, and the blue on a light one. */
const SELECT = "#1a73e8";
const GUIDE = "#ec4899";
/** A press that moves less than this is a click, not a drag. */
const DRAG_FROM = 3;
/** An arrow key moves a layer this far, as a fraction of the canvas; with Shift, the second. */
const NUDGE = [0.005, 0.02] as const;
const ARROWS: Record<string, [x: number, y: number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const HANDLES: Record<Handle, [x: number, y: number, cursor: string]> = {
  n: [0.5, 0, "ns-resize"],
  e: [1, 0.5, "ew-resize"],
  s: [0.5, 1, "ns-resize"],
  w: [0, 0.5, "ew-resize"],
  nw: [0, 0, "nwse-resize"],
  ne: [1, 0, "nesw-resize"],
  sw: [0, 1, "nesw-resize"],
  se: [1, 1, "nwse-resize"],
};
const EDGES: Handle[] = ["n", "e", "s", "w"];
const CORNERS: Handle[] = ["nw", "ne", "sw", "se"];

/** The handles a layer has. A badge (the fixed one or one she added) is as big as its words, so it has
 *  none (the fixed one's size is a slider in the toolbar); a logo keeps its shape. */
function handlesFor(recipe: CoverRecipe, id: string): Handle[] {
  if (
    id === "badge" ||
    recipe.extras.some((extra) => extra.id === id && extra.type === "badge")
  ) {
    return [];
  }
  return id === "logo" ? CORNERS : [...EDGES, ...CORNERS];
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;
// written as CoverArt writes a layer's box, so a selection sits exactly on its layer
const pct = (v: number) => `${+(v * 100).toFixed(3)}%`;
const place = (f: Frame): CSSProperties => ({
  left: pct(f.x),
  top: pct(f.y),
  width: pct(f.w),
  height: pct(f.h),
});

const WORDS = ["label", "title", "subtitle"] as const;
type WordsPart = (typeof WORDS)[number];
const isWordsPart = (id: string): id is WordsPart =>
  (WORDS as readonly string[]).includes(id);

/** Whether double-clicking a layer types in it: the three words and her text layers. */
export function editsInPlace(recipe: CoverRecipe, id: string): boolean {
  return (
    isWordsPart(id) ||
    recipe.extras.some((extra) => extra.id === id && extra.type === "text")
  );
}

/** The words a layer shows now: the item's own title until she types another. */
export function layerWords(
  recipe: CoverRecipe,
  item: CoverItem,
  id: string,
  locale: string,
): string {
  const extra = recipe.extras.find((e) => e.id === id);
  if (extra) return "text" in extra ? extra.text : "";
  return isWordsPart(id)
    ? resolveWords(recipe, item, new Date(), locale)[id]
    : "";
}

/** Words as the cover keeps them: on one line, trimmed. A browser types a non-breaking space for a
 *  second space in a row, and a break for Enter. */
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

/** What leaving a field of typed words does, or null when nothing changed. `was` is what the layer
 *  showed when the field opened, so a title that follows the item stays following it unless she
 *  changes it. A text layer she emptied goes (an empty one would be invisible and still take a
 *  place of the twelve); a word she emptied stays, and a title goes back to the item's own. */
export function textEdit(
  recipe: CoverRecipe,
  id: string,
  typed: string,
  was: string,
): EditorAction | null {
  const extra = recipe.extras.find((e) => e.id === id);
  if (!extra && !isWordsPart(id)) return null;
  const limit = extra
    ? extra.type === "badge"
      ? TEXT_MAX.badge
      : TEXT_MAX.extra
    : TEXT_MAX[id as WordsPart];
  const cut = (words: string) => plain(words).slice(0, limit).trimEnd();
  const text = cut(typed);
  // `was` is cut the same way: an item's title can be longer than a cover keeps, and one she opened and
  // left as it was must not become a copy of its first words that no longer follows the item.
  if (text === cut(was)) return null;
  if (extra) {
    return text === ""
      ? { type: "remove", id }
      : { type: "updateExtra", id, patch: { text } };
  }
  return { type: "words", patch: { [id as WordsPart]: text } };
}

/** A box on the screen as a fraction of the canvas's width and height. */
function fraction(box: DOMRect, canvas: DOMRect): Frame {
  return {
    x: round((box.left - canvas.left) / canvas.width),
    y: round((box.top - canvas.top) / canvas.height),
    w: round(box.width / canvas.width),
    h: round(box.height / canvas.height),
  };
}

/** Where a picture is drawn inside its element, which fits it whole (`object-fit: contain`) and puts
 *  it at the side `object-position` names: a logo is a small mark in a wide frame. */
function drawnPicture(img: HTMLImageElement): DOMRect {
  const box = img.getBoundingClientRect();
  const { naturalWidth: nw, naturalHeight: nh } = img;
  if (!nw || !nh) return box;
  const scale = Math.min(box.width / nw, box.height / nh);
  const [x = 0.5, y = 0.5] = getComputedStyle(img)
    .objectPosition.split(" ")
    .map((v) => (Number.isNaN(parseFloat(v)) ? 0.5 : parseFloat(v) / 100));
  const w = nw * scale;
  const h = nh * scale;
  return new DOMRect(
    box.left + (box.width - w) * x,
    box.top + (box.height - h) * y,
    w,
    h,
  );
}

/** What is on the canvas, as measured. The frames are where the layout puts a layer, but a badge is
 *  only as big as its words (and may reach past its frame) and a logo only as big as its mark, so for
 *  those the rendered box is the one she sees and can grab. A layer the cover does not draw (a badge
 *  with nothing to say, a logo she has not added) is not here at all. */
interface Seen {
  drawn: string[];
  tight: Record<string, Frame>;
}

const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Gesture =
  | {
      kind: "move";
      id: string;
      origin: Frame;
      /** The box actually drawn: the frame, unless the layer is drawn smaller than it (a logo, a badge). */
      drawn: Frame;
      /** What it snaps to: the canvas's edges and middle, and those of the other layers on it. */
      guides: { x: number[]; y: number[] };
    }
  | {
      kind: "resize";
      id: string;
      handle: Handle;
      origin: Frame;
      /** The box actually drawn, for a layer drawn smaller than its frame. */
      drawn: Frame | null;
    }
  | {
      kind: "pan";
      focus: [number, number];
      /** The photo's frame and the photo itself, in px. */
      frame: { w: number; h: number };
      image: { w: number; h: number } | null;
    };

interface Drag {
  gesture: Gesture;
  pointerId: number;
  /** Where the pointer went down, and the canvas then. */
  x: number;
  y: number;
  canvas: DOMRect;
  moved: boolean;
}

/** Whether a gesture ended with its layer where it began (she dragged it back). */
function wentNowhere(gesture: Gesture, action: EditorAction): boolean {
  return (
    gesture.kind !== "pan" &&
    action.type === "frame" &&
    (["x", "y", "w", "h"] as const).every(
      (side) => Math.abs(action.frame[side] - gesture.origin[side]) < 1e-9,
    )
  );
}

/** The edit a gesture has made so far, drawn but not yet sent, and the guides it is on. */
interface Live {
  action: EditorAction;
  guides: { x?: number; y?: number };
}

/** Words open for typing: where they are, and how they are set. */
interface Typing {
  id: string;
  /** What the layer showed when she began. */
  was: string;
  box: Frame;
  style: CSSProperties;
}

/** The field she types in: the words' own typeface, size and place, over the words (which are hidden
 *  meanwhile). Enter or leaving it keeps what she typed; Escape drops it. */
function WordsField({
  typing,
  label,
  onDone,
}: {
  typing: Typing;
  label: string;
  onDone: (typed: string | null, refocus: boolean) => void;
}) {
  const field = useRef<HTMLSpanElement>(null);
  // Leaving by Enter or Escape also blurs the field, and an unmounted one may too: only the first counts.
  const done = useRef(false);
  const finish = (keep: boolean, refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(keep ? (field.current?.textContent ?? "") : null, refocus);
  };
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    // everything selected, so that typing replaces the words
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);
  return (
    <div
      className="absolute flex flex-col"
      style={{ ...place(typing.box), ...typing.style }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span
        ref={field}
        role="textbox"
        aria-label={label}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        spellCheck={false}
        // (Safari does not let her type in what sits inside text that cannot be selected)
        className="block min-w-[1ch] cursor-text select-text break-words"
        style={{ outline: `2px solid ${SELECT}`, outlineOffset: 2 }}
        onBlur={() => finish(true, false)}
        onKeyDown={(e) => {
          // (an Enter that picks a character in an input method is not ours)
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (!e.shiftKey) finish(true, true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            finish(false, true);
          }
        }}
      >
        {typing.was}
      </span>
    </div>
  );
}

export function StudioCanvas({
  recipe,
  design,
  item,
  size,
  cardAspect,
  selected,
  onSelect,
  onEdit,
  generating = false,
  disabled = false,
}: StudioCanvasProps) {
  const own = useLocale();
  const locale = useSiteLocale() ?? own;
  const t = useTranslations("admin.studio");
  const canvas = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The same as `live`, for the handler that must read it before the next render.
  const liveRef = useRef<Live | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [, remeasure] = useState(0);

  const shown = useMemo(
    () => (live ? applyEdit(recipe, live.action) : recipe),
    [recipe, live],
  );
  const frames = useMemo(
    () => framesFor(shown, size, cardAspect),
    [shown, size, cardAspect],
  );
  const order = useMemo(() => layerOrder(shown), [shown]);
  const boxes = useMemo(() => {
    if (!seen) return frames;
    const out: Record<string, Frame> = {};
    for (const [id, frame] of Object.entries(frames)) {
      if (seen.drawn.includes(id)) out[id] = seen.tight[id] ?? frame;
    }
    return out;
  }, [frames, seen]);

  // The cover is drawn again only when something it draws changes, not for a hover or a measure.
  const { id, photos, logo_url, look } = design;
  const { title, createdAt, startsAt, timeZone } = item;
  const cover = useMemo(
    () => (
      <CoverArt
        design={{ id, recipe: shown, photos, logo_url, look }}
        item={{ title, createdAt, startsAt, timeZone }}
        size={size}
      />
    ),
    [
      id,
      shown,
      photos,
      logo_url,
      look,
      title,
      createdAt,
      startsAt,
      timeZone,
      size,
    ],
  );

  // What the cover drew, measured after every render and whenever a picture or a font arrives.
  useBrowserLayoutEffect(() => {
    const root = art.current;
    const surface = overlay.current?.getBoundingClientRect();
    if (!root || !surface || !surface.width || !surface.height) return;
    const next: Seen = { drawn: [], tight: {} };
    root.querySelectorAll<HTMLElement>("[data-layer]").forEach((el) => {
      const layer = el.dataset.layer as string;
      next.drawn.push(layer);
      const chip = el.hasAttribute("data-badge") && el.querySelector("span");
      const mark = el.hasAttribute("data-logo") && el.querySelector("img");
      if (chip)
        next.tight[layer] = fraction(chip.getBoundingClientRect(), surface);
      if (mark) next.tight[layer] = fraction(drawnPicture(mark), surface);
    });
    setSeen((now) =>
      now && JSON.stringify(now) === JSON.stringify(next) ? now : next,
    );
  });
  useEffect(() => {
    const again = () => remeasure((n) => n + 1);
    document.fonts?.addEventListener("loadingdone", again);
    return () => document.fonts?.removeEventListener("loadingdone", again);
  }, []);

  // The words being typed are hidden under the field that replaces them.
  useBrowserLayoutEffect(() => {
    const words =
      typing &&
      art.current?.querySelector<HTMLElement>(`[data-layer="${typing.id}"]`);
    if (!words) return;
    words.style.visibility = "hidden";
    return () => {
      words.style.visibility = "";
    };
  }, [typing]);

  const surface = () =>
    (overlay.current as HTMLDivElement).getBoundingClientRect();
  /** The layer under the pointer; with Alt, the photo wherever it is under it. */
  function layerAt(e: { clientX: number; clientY: number; altKey: boolean }) {
    const rect = surface();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return e.altKey && hitTest(boxes, x, y, ["photo"])
      ? "photo"
      : hitTest(boxes, x, y, order);
  }

  function begin(
    e: PointerEvent<HTMLElement>,
    gesture: Gesture,
    capture: HTMLElement,
  ) {
    drag.current = {
      gesture,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      canvas: surface(),
      moved: false,
    };
    capture.setPointerCapture(e.pointerId);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return;
    // (the press focuses the canvas by itself, and without the keyboard's focus ring)
    const layer = layerAt(e);
    onSelect(layer);
    if (!layer || !frames[layer]) return;
    if (e.altKey && layer === "photo") {
      const frame = art.current?.querySelector('[data-layer="photo"]');
      const image = frame?.querySelector("img");
      const rect = frame?.getBoundingClientRect();
      const canvasRect = surface();
      begin(
        e,
        {
          kind: "pan",
          focus: recipe.photo.focus,
          frame: {
            w: rect?.width ?? frames.photo.w * canvasRect.width,
            h: rect?.height ?? frames.photo.h * canvasRect.height,
          },
          image: image?.naturalWidth
            ? { w: image.naturalWidth, h: image.naturalHeight }
            : null,
        },
        e.currentTarget,
      );
    } else {
      begin(
        e,
        {
          kind: "move",
          id: layer,
          origin: frames[layer],
          drawn: boxes[layer] ?? frames[layer],
          // the boxes she sees of the layers that stay (the photo and the panel included, so her words line
          // up with them too)
          guides: guidesFrom(
            Object.entries(boxes)
              .filter(([id]) => id !== layer)
              .map(([, box]) => box),
          ),
        },
        e.currentTarget,
      );
    }
  }

  function onHandleDown(e: PointerEvent<HTMLElement>, handle: Handle) {
    if (disabled || e.button !== 0 || !selected || !frames[selected]) return;
    e.stopPropagation();
    begin(
      e,
      {
        kind: "resize",
        id: selected,
        handle,
        origin: frames[selected],
        drawn: selected === "logo" ? (boxes.logo ?? null) : null,
      },
      e.currentTarget,
    );
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) {
      if (!disabled && !typing && e.pointerType === "mouse") {
        setHover(layerAt(e));
      }
      return;
    }
    if (e.pointerId !== d.pointerId) return;
    const px = e.clientX - d.x;
    const py = e.clientY - d.y;
    if (!d.moved && Math.hypot(px, py) < DRAG_FROM) return;
    d.moved = true;
    const dx = px / d.canvas.width;
    const dy = py / d.canvas.height;
    const g = d.gesture;
    let next: Live;
    if (g.kind === "move") {
      const moved = moveFrame(g.origin, dx, dy);
      // the guides are met by the box she sees (a logo's mark, a badge's chip), which goes as far as its frame
      const snapped = snapDrawn(
        moved,
        {
          ...g.drawn,
          x: g.drawn.x + moved.x - g.origin.x,
          y: g.drawn.y + moved.y - g.origin.y,
        },
        g.guides,
      );
      next = {
        action: { type: "frame", size, id: g.id, frame: snapped.frame },
        guides: snapped.guides,
      };
    } else if (g.kind === "resize") {
      const aspect = d.canvas.width / d.canvas.height;
      const frame = g.drawn
        ? resizeDrawn(g.origin, g.drawn, g.handle, dx, dy, aspect)
        : resizeFrame(g.origin, g.handle, dx, dy, e.shiftKey, aspect);
      next = { action: { type: "frame", size, id: g.id, frame }, guides: {} };
    } else {
      // a flipped photo moves the other way under the pointer
      const focus = panFocus(
        g.focus,
        [recipe.photo.flip ? -px : px, py],
        g.frame,
        g.image,
        recipe.photo.zoom,
      );
      next = { action: { type: "photoAdjust", patch: { focus } }, guides: {} };
    }
    liveRef.current = next;
    setLive(next);
  }

  function cancel() {
    drag.current = null;
    liveRef.current = null;
    setLive(null);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const done = liveRef.current;
    cancel();
    // one edit for the whole gesture, so Undo takes all of it back; none if it came back to the start
    if (d.moved && done && !wentNowhere(d.gesture, done.action)) {
      onEdit(done.action);
    }
  }

  function startTyping(layer: string) {
    const words = art.current?.querySelector<HTMLElement>(
      `[data-layer="${layer}"]`,
    );
    if (!words) return;
    const css = getComputedStyle(words);
    onSelect(layer);
    setTyping({
      id: layer,
      was: layerWords(recipe, item, layer, locale),
      box: fraction(words.getBoundingClientRect(), surface()),
      style: {
        justifyContent: css.justifyContent,
        textAlign: css.textAlign as CSSProperties["textAlign"],
        fontFamily: css.fontFamily,
        fontSize: css.fontSize,
        fontWeight: css.fontWeight,
        lineHeight: css.lineHeight,
        letterSpacing: css.letterSpacing,
        textTransform: css.textTransform as CSSProperties["textTransform"],
        color: css.color,
      },
    });
  }

  function stopTyping(typed: string | null, refocus: boolean) {
    const field = typing;
    setTyping(null);
    if (refocus) canvas.current?.focus({ preventScroll: true });
    if (typed === null || !field) return;
    const action = textEdit(recipe, field.id, typed, field.was);
    if (!action) return;
    onEdit(action);
    if (action.type === "remove") onSelect(null);
  }

  function onDoubleClick(e: MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const layer = layerAt(e);
    if (layer && editsInPlace(recipe, layer)) startTyping(layer);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // typing in a field has its own keys
    if (disabled || typing) return;
    if (e.key === "Escape") {
      if (drag.current) cancel();
      else if (selected) onSelect(null);
      else return;
      // not also whatever closes a dialog around the canvas
      e.stopPropagation();
      return;
    }
    // (a layer the cover does not draw cannot be moved from here)
    const frame = selected && boxes[selected] ? frames[selected] : undefined;
    if (!selected || !frame) return;
    const arrow = ARROWS[e.key];
    if (arrow && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const step = NUDGE[e.shiftKey ? 1 : 0];
      onEdit({
        type: "frame",
        size,
        id: selected,
        frame: moveFrame(frame, arrow[0] * step, arrow[1] * step),
      });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      // (the panel stays, and stays selected: she changes its colour)
      if (!canRemove(selected)) return;
      onEdit({ type: "remove", id: selected });
      onSelect(null);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      // Cmd-D is the browser's bookmark: never let it through
      e.preventDefault();
      if (
        recipe.extras.some((extra) => extra.id === selected) &&
        recipe.extras.length < MAX_EXTRAS
      ) {
        onEdit({ type: "duplicate", id: selected });
        onSelect(newExtraId(recipe, selected));
      }
    } else if (e.key === "Enter" && editsInPlace(recipe, selected)) {
      e.preventDefault();
      startTyping(selected);
    }
  }

  const aspect = sizeAspect(size, cardAspect);
  const box = selected ? boxes[selected] : undefined;
  const photoFrame = frames.photo;
  return (
    <div
      ref={canvas}
      data-testid="studio-canvas"
      role="application"
      aria-label={t("canvas.label")}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      className="relative mx-auto w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        aspectRatio: String(aspect),
        maxWidth: `calc(var(--cover-max-h, max(60vh, 16rem)) * ${aspect})`,
      }}
    >
      <div
        ref={art}
        role="img"
        aria-label={t("previews.label", { size: t(`size.${size}`) })}
        // a picture or a font that arrives can change what the layers measure
        onLoadCapture={() => remeasure((n) => n + 1)}
        className="absolute inset-0 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/15"
      >
        {cover}
        {generating && photoFrame && (
          <Skeleton
            aria-hidden="true"
            className="absolute rounded-none"
            style={place(photoFrame)}
          />
        )}
      </div>
      {/* The editing layer: the pointer's, and the selection drawn on it. Not clipped, so the handles of
          a layer at the edge of the cover show whole. */}
      <div
        ref={overlay}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        className="absolute inset-0 touch-none select-none"
        style={{
          pointerEvents: disabled ? "none" : undefined,
          cursor: live
            ? "grabbing"
            : hover && hover === selected
              ? "move"
              : hover
                ? "pointer"
                : undefined,
        }}
      >
        {live?.guides.x !== undefined && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: pct(live.guides.x), background: GUIDE }}
          />
        )}
        {live?.guides.y !== undefined && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-px"
            style={{ top: pct(live.guides.y), background: GUIDE }}
          />
        )}
        {hover && hover !== selected && boxes[hover] && !live && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              ...place(boxes[hover]),
              outline: `1px solid ${SELECT}`,
              outlineOffset: 1,
              opacity: 0.6,
            }}
          />
        )}
        {box && selected && !typing && (
          <>
            <div
              aria-hidden="true"
              data-testid="selection-box"
              data-layer-id={selected}
              className="pointer-events-none absolute"
              style={{
                ...place(box),
                outline: `2px solid ${SELECT}`,
                outlineOffset: 1,
                boxShadow: "0 0 0 1px rgb(255 255 255 / 0.9)",
              }}
            />
            {handlesFor(recipe, selected).map((handle) => {
              const [hx, hy, cursor] = HANDLES[handle];
              return (
                <div
                  key={handle}
                  data-handle={handle}
                  onPointerDown={(e) => onHandleDown(e, handle)}
                  className="absolute grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center"
                  style={{
                    // centred on the selection line, which sits just outside the box
                    left: `calc(${pct(box.x + box.w * hx)} + ${(hx - 0.5) * 6}px)`,
                    top: `calc(${pct(box.y + box.h * hy)} + ${(hy - 0.5) * 6}px)`,
                    cursor,
                    touchAction: "none",
                  }}
                >
                  <span
                    className="size-2 rounded-[2px] border-2 bg-white"
                    style={{ borderColor: SELECT }}
                  />
                </div>
              );
            })}
          </>
        )}
        {typing && (
          <WordsField
            typing={typing}
            label={t("canvas.editWords")}
            onDone={stopTyping}
          />
        )}
      </div>
    </div>
  );
}
