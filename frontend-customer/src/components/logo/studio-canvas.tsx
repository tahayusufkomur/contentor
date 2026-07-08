"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { LogoRecipe } from "@/types/logo";
import { logoViewBox, LogoRenderer } from "./logo-renderer";

export type ElementKey = "mark" | "name" | "tagline";

interface StudioCanvasProps {
  recipe: LogoRecipe;
  selected: ElementKey | null;
  onSelect: (element: ElementKey | null) => void;
  onChange: (recipe: LogoRecipe) => void;
  dark: boolean;
  onToggleDark: () => void;
  /** Export ref — points at the clean LogoRenderer svg; the selection
   * overlay lives in a separate svg so exports never see it. */
  logoSvgRef: React.RefObject<SVGSVGElement>;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CANVAS_WIDTH = 560;
const OFFSET_LIMIT = 120;
const SNAP = 6;

const clampOff = (v: number) =>
  Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, v));
const snapZero = (v: number) => (Math.abs(v) < SNAP ? 0 : v);

/** Direct-manipulation canvas: click a [data-part] to select, drag to move
 * (snap-to-center guides), corner handles to scale, arrows to nudge. */
export function StudioCanvas({
  recipe,
  selected,
  onSelect,
  onChange,
  dark,
  onToggleDark,
  logoSvgRef,
}: StudioCanvasProps) {
  const vb = logoViewBox(recipe.layout);
  const scaleToPx = CANVAS_WIDTH / vb.w;
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null); // viewBox units
  const dragRef = useRef<{
    kind: "move" | "scale";
    part: ElementKey;
    startX: number;
    startY: number;
    baseOffset: [number, number];
    baseScale: number;
    center: [number, number]; // screen px
    baseDist: number;
  } | null>(null);
  // Which axes are currently snapped mid-drag (drives the guide lines).
  const [snapped, setSnapped] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  });
  const [dragging, setDragging] = useState(false);

  // Track the selected element's rendered bounding box (viewBox units).
  // getBBox() reflects the applied transform's target, so measure the GROUP
  // (which carries the placement transform) via getBBox + the transform is
  // already baked into the coordinates? No: getBBox is in the group's own
  // coordinate system. Use getBBox of the group's CHILDREN via
  // getBoundingClientRect instead — screen space — then convert to viewBox
  // units relative to the svg's rect. Robust across transforms and layouts.
  useLayoutEffect(() => {
    if (!selected || !logoSvgRef.current) {
      setBox(null);
      return;
    }
    const svg = logoSvgRef.current;
    const group = svg.querySelector(`[data-part="${selected}"]`);
    if (!group) {
      setBox(null);
      return;
    }
    const svgRect = svg.getBoundingClientRect();
    const rect = (group as SVGGElement).getBoundingClientRect();
    if (!svgRect.width || !rect.width) {
      setBox(null);
      return;
    }
    const toVb = vb.w / svgRect.width;
    setBox({
      x: (rect.left - svgRect.left) * toVb,
      y: (rect.top - svgRect.top) * toVb,
      w: rect.width * toVb,
      h: rect.height * toVb,
    });
  }, [recipe, selected, vb.w, logoSvgRef]);

  function setPlacement(
    part: ElementKey,
    offset: [number, number],
    scale: number,
  ) {
    onChange({
      ...recipe,
      elements: { ...recipe.elements, [part]: { offset, scale } },
    });
  }

  function beginMove(e: React.PointerEvent<SVGSVGElement>) {
    const part = (e.target as Element)
      .closest("[data-part]")
      ?.getAttribute("data-part") as ElementKey | null;
    if (!part) {
      onSelect(null);
      return;
    }
    onSelect(part);
    containerRef.current?.focus();
    const placement = recipe.elements[part];
    dragRef.current = {
      kind: "move",
      part,
      startX: e.clientX,
      startY: e.clientY,
      baseOffset: [...placement.offset] as [number, number],
      baseScale: placement.scale,
      center: [0, 0],
      baseDist: 1,
    };
    setDragging(true);
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function beginScale(e: React.PointerEvent<HTMLDivElement>, part: ElementKey) {
    if (!box) return;
    e.stopPropagation();
    const svgRect = logoSvgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const toPx = svgRect.width / vb.w;
    const center: [number, number] = [
      svgRect.left + (box.x + box.w / 2) * toPx,
      svgRect.top + (box.y + box.h / 2) * toPx,
    ];
    const baseDist = Math.max(
      8,
      Math.hypot(e.clientX - center[0], e.clientY - center[1]),
    );
    dragRef.current = {
      kind: "scale",
      part,
      startX: e.clientX,
      startY: e.clientY,
      baseOffset: [...recipe.elements[part].offset] as [number, number],
      baseScale: recipe.elements[part].scale,
      center,
      baseDist,
    };
    setDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function movePointer(e: React.PointerEvent<Element>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "move") {
      const svg = logoSvgRef.current;
      if (!svg) return;
      const toVb = vb.w / svg.getBoundingClientRect().width;
      const rawX = drag.baseOffset[0] + (e.clientX - drag.startX) * toVb;
      const rawY = drag.baseOffset[1] + (e.clientY - drag.startY) * toVb;
      const dx = snapZero(clampOff(rawX));
      const dy = snapZero(clampOff(rawY));
      setSnapped({ x: dx === 0 && rawX !== 0, y: dy === 0 && rawY !== 0 });
      setPlacement(drag.part, [dx, dy], drag.baseScale);
    } else {
      const dist = Math.hypot(
        e.clientX - drag.center[0],
        e.clientY - drag.center[1],
      );
      const scale = Math.max(
        0.4,
        Math.min(3, drag.baseScale * (dist / drag.baseDist)),
      );
      setPlacement(drag.part, drag.baseOffset, Number(scale.toFixed(2)));
    }
  }

  function endPointer() {
    dragRef.current = null;
    setDragging(false);
    setSnapped({ x: false, y: false });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!selected) return;
    if (e.key === "Escape") {
      // Deselect only — don't let the dialog's document-level Escape
      // handler close the whole studio.
      e.stopPropagation();
      onSelect(null);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    const placement = recipe.elements[selected];
    setPlacement(
      selected,
      [
        clampOff(placement.offset[0] + delta[0]),
        clampOff(placement.offset[1] + delta[1]),
      ],
      placement.scale,
    );
  }

  const handles: { key: string; x: number; y: number }[] =
    box && selected
      ? [
          { key: "nw", x: box.x, y: box.y },
          { key: "ne", x: box.x + box.w, y: box.y },
          { key: "sw", x: box.x, y: box.y + box.h },
          { key: "se", x: box.x + box.w, y: box.y + box.h },
        ]
      : [];

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full max-w-xl items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selected
            ? "Drag to move · corners to resize · arrows to nudge · Esc to deselect"
            : "Click any part of your logo to edit it"}
        </p>
        <button
          type="button"
          aria-label={
            dark ? "Preview on light background" : "Preview on dark background"
          }
          aria-pressed={dark}
          onClick={onToggleDark}
          className="rounded-md border p-1.5 text-muted-foreground hover:border-foreground"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <div
        ref={containerRef}
        data-testid="studio-canvas"
        tabIndex={0}
        role="application"
        aria-label="Logo canvas"
        onKeyDown={onKeyDown}
        className={`relative rounded-lg border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${dark ? "bg-zinc-900" : "bg-white"} ${dragging ? "cursor-grabbing" : ""}`}
        style={{ width: CANVAS_WIDTH + 32, padding: 16 }}
      >
        <LogoRenderer
          recipe={recipe}
          width={CANVAS_WIDTH}
          svgRef={logoSvgRef}
          onPointerDown={beginMove}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          className={selected ? "" : "[&_[data-part]]:cursor-pointer"}
        />
        {/* Selection overlay: separate svg, never part of the export. */}
        <svg
          viewBox={`0 0 ${vb.w} ${vb.h}`}
          width={CANVAS_WIDTH}
          height={(CANVAS_WIDTH * vb.h) / vb.w}
          className="pointer-events-none absolute left-4 top-4"
          aria-hidden="true"
        >
          {dragging && snapped.x && box && (
            <line
              x1={box.x + box.w / 2}
              y1={0}
              x2={box.x + box.w / 2}
              y2={vb.h}
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          )}
          {dragging && snapped.y && box && (
            <line
              x1={0}
              y1={box.y + box.h / 2}
              x2={vb.w}
              y2={box.y + box.h / 2}
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          )}
          {box && selected && (
            <rect
              data-testid="selection-box"
              x={box.x - 4}
              y={box.y - 4}
              width={box.w + 8}
              height={box.h + 8}
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}
        </svg>
        {/* Corner handles: positioned divs so they get real cursors + a
            comfortable hit area. */}
        {selected &&
          handles.map((h) => (
            <div
              key={h.key}
              role="presentation"
              onPointerDown={(e) => beginScale(e, selected)}
              onPointerMove={movePointer}
              onPointerUp={endPointer}
              className="absolute z-10 h-3 w-3 rounded-sm border border-indigo-500 bg-white shadow-sm"
              style={{
                left: 16 + h.x * scaleToPx - 6,
                top: 16 + h.y * scaleToPx - 6,
                cursor:
                  h.key === "nw" || h.key === "se"
                    ? "nwse-resize"
                    : "nesw-resize",
                touchAction: "none",
              }}
            />
          ))}
      </div>
    </div>
  );
}
