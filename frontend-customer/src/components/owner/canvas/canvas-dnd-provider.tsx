"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getBlockDef, newBlock } from "@/lib/blocks/registry";
import { useEditorStore } from "./editor-store";
import { canvasCollisionDetection } from "./dnd-collision";
import {
  isPaletteId,
  isDropZoneId,
  paletteTypeFromId,
  dropZoneIndexFromId,
} from "./types";
import type { PageKey } from "@/types/tenant";

interface CanvasDndProviderProps {
  activePageKey: PageKey | null;
  children: React.ReactNode;
}

/** Hosts the single DndContext that spans both the sidebar palette and the
 *  on-page canvas. Lives inside EditorStoreProvider so drag handlers can
 *  read/mutate block order. Handles two operations: reordering existing blocks
 *  and inserting a new block dragged from the palette onto a drop zone. */
export function CanvasDndProvider({
  activePageKey,
  children,
}: CanvasDndProviderProps) {
  const store = useEditorStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !activePageKey) return;
    const activeIdStr = String(active.id);

    // Insert a new block from the palette at the targeted drop zone.
    if (isPaletteId(activeIdStr)) {
      if (!isDropZoneId(String(over.id))) return;
      store.insertBlock(
        activePageKey,
        newBlock(paletteTypeFromId(activeIdStr), store.niche),
        dropZoneIndexFromId(String(over.id)),
      );
      return;
    }

    // Reorder an existing block.
    if (active.id === over.id) return;
    const blocks = store.blocksFor(activePageKey);
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from >= 0 && to >= 0) store.reorderBlocks(activePageKey, from, to);
  }

  let overlayLabel: string | null = null;
  if (activeId && activePageKey) {
    if (isPaletteId(activeId)) {
      const type = paletteTypeFromId(activeId);
      overlayLabel = getBlockDef(type)?.label ?? type;
    } else {
      const block = store
        .blocksFor(activePageKey)
        .find((b) => b.id === activeId);
      if (block) overlayLabel = getBlockDef(block.type)?.label ?? block.type;
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={canvasCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {overlayLabel ? (
          <div className="rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-lg">
            {overlayLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
