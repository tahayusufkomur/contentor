"use client";

// One DndContext for the palette and the canvas. Every list (a region, or a
// column at any depth) has drop zones between its blocks; dragging a palette
// entry inserts there, dragging a block's grip moves it there. Zones are the
// only droppables, so the two operations never fight over targets.

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createContext, useContext, useMemo, useRef, useState } from "react";

import { cn } from "../../../lib/utils";
import { useEmailEditor } from "../store";
import type { Block, DropTarget } from "../types";

const CanvasRefContext =
  createContext<React.MutableRefObject<HTMLDivElement | null> | null>(null);

/** The canvas element: drops only land while the pointer is over it. */
export function useCanvasRef() {
  const ref = useContext(CanvasRefContext);
  if (!ref) throw new Error("useCanvasRef must be used inside <EditorDnd>");
  return ref;
}

const zoneId = (t: DropTarget) =>
  `drop:${t.region}:${t.parentId ?? ""}:${t.columnId ?? ""}:${t.index ?? ""}`;

interface PaletteDragData {
  fromPalette: true;
  label: string;
  create: () => Block;
}

interface BlockDragData {
  blockId: string;
  label: string;
}

export function EditorDnd({ children }: { children: React.ReactNode }) {
  const store = useEmailEditor();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Over a zone: that zone. Elsewhere on the canvas: the zone nearest the
  // pointer (not the dragged block's centre: a tall block is held by its top
  // toolbar), sideways distance costing more so a drop stays in the column
  // under the pointer. Off the canvas (back over the palette): nothing, so a
  // drag can be called off.
  const collision = useMemo<CollisionDetection>(
    () => (args) => {
      const within = pointerWithin(args);
      if (within.length) return within;
      const p = args.pointerCoordinates;
      const area = canvasRef.current?.getBoundingClientRect();
      if (!p || !area) return [];
      if (
        p.x < area.left ||
        p.x > area.right ||
        p.y < area.top ||
        p.y > area.bottom
      )
        return [];
      let best: Collision | null = null;
      let bestScore = Infinity;
      for (const container of args.droppableContainers) {
        const r = args.droppableRects.get(container.id);
        if (!r) continue;
        const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width));
        const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height));
        const score = dx * dx * 4 + dy * dy;
        if (score < bestScore) {
          bestScore = score;
          best = {
            id: container.id,
            data: { droppableContainer: container, value: score },
          };
        }
      }
      return best ? [best] : [];
    },
    [],
  );

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | PaletteDragData
      | BlockDragData
      | undefined;
    setLabel(data?.label ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setLabel(null);
    const target = event.over?.data.current?.target as DropTarget | undefined;
    if (!target) return;
    const data = event.active.data.current as
      | PaletteDragData
      | BlockDragData
      | undefined;
    if (!data) return;
    if ("fromPalette" in data) store.insert(data.create(), target);
    else store.move(data.blockId, target);
  }

  return (
    <CanvasRefContext.Provider value={canvasRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setLabel(null)}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {label ? (
            <div className="rounded-lg border bg-background px-3 py-2 font-sans text-sm font-medium text-foreground shadow-lg">
              {label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CanvasRefContext.Provider>
  );
}

/** An insertion slot. Flat until something is dragged; in an empty list it is
 *  the list's visible placeholder ("Drop a block here"). */
export function DropZone({
  target,
  empty,
}: {
  target: DropTarget;
  empty?: string;
}) {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: zoneId(target),
    data: { target },
  });
  const dragging = !!active;

  if (empty !== undefined) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "m-2 flex min-h-14 items-center justify-center rounded-md border border-dashed px-3 py-3 text-center font-sans text-xs transition-colors",
          isOver
            ? "border-primary bg-primary/10 text-primary"
            : "border-[#b8b8b8] text-[#8a8a8a]",
        )}
      >
        {empty}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn(
        "relative transition-[height] duration-150",
        dragging ? "h-4" : "h-0",
      )}
    >
      {dragging && (
        <div
          className={cn(
            "absolute inset-x-3 top-1/2 z-40 -translate-y-1/2 rounded-full transition-all",
            isOver
              ? "h-1.5 bg-primary ring-4 ring-primary/20"
              : "h-0.5 bg-primary/25",
          )}
        />
      )}
    </div>
  );
}

/** A palette entry: click adds it next to the selection, drag drops it on a zone. */
export function PaletteSource({
  id,
  label,
  create,
  onClick,
  className,
  children,
}: {
  id: string;
  label: string;
  create: () => Block;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `palette:${id}`,
    data: { fromPalette: true, label, create } satisfies PaletteDragData,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={cn(className, isDragging && "opacity-40")}
    >
      {children}
    </button>
  );
}

/** Drag wiring for a block on the canvas (the toolbar grip is the handle). */
export function useBlockDrag(block: Block, label: string) {
  return useDraggable({
    id: `block:${block.id}`,
    data: { blockId: block.id, label } satisfies BlockDragData,
  });
}
