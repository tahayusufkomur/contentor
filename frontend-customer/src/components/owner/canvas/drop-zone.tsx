"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { dropZoneId, isPaletteId } from "./types";
import type { PageKey } from "@/types/tenant";

interface DropZoneProps {
  pageKey: PageKey;
  index: number;
}

/** An insertion slot between blocks. Collapsed to zero height (no layout
 *  impact) until a palette block is being dragged, at which point it becomes a
 *  target and shows a highlight bar when the pointer is over it. */
export function DropZone({ pageKey, index }: DropZoneProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: dropZoneId(pageKey, index),
  });
  const paletteDragging = active ? isPaletteId(String(active.id)) : false;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative transition-[height] duration-150",
        paletteDragging ? "h-5" : "h-0",
      )}
    >
      {paletteDragging && (
        <div
          className={cn(
            "absolute inset-x-4 top-1/2 z-40 -translate-y-1/2 rounded-full transition-all",
            isOver
              ? "h-1.5 bg-primary ring-4 ring-primary/20"
              : "h-0.5 bg-primary/30",
          )}
        />
      )}
    </div>
  );
}
