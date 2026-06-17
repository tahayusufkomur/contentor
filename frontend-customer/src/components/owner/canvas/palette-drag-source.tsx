"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { paletteDragId } from "./types";

interface PaletteDragSourceProps {
  type: string;
  /** Click-to-add fallback (appends to the end of the page). */
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}

/** A palette entry that can be either clicked (append block) or dragged onto a
 *  drop zone in the canvas (insert at a specific position). The DndContext's
 *  pointer sensor has a 6px activation distance, so a plain click still fires
 *  `onClick` while a drag starts the insert. */
export function PaletteDragSource({
  type,
  onClick,
  className,
  children,
}: PaletteDragSourceProps) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: paletteDragId(type),
    data: { fromPalette: true, blockType: type },
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
