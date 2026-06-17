import {
  pointerWithin,
  closestCenter,
  type CollisionDetection,
} from "@dnd-kit/core";
import { isPaletteId, isDropZoneId } from "./types";

/** Collision detection that switches strategy by what's being dragged:
 *  - a palette item (new block) only collides with drop-zone slots, using the
 *    pointer position (falling back to closest center);
 *  - an existing block being reordered only collides with the other block
 *    sortables, never the drop zones.
 *  This keeps the two operations from interfering within one DndContext. */
export const canvasCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);

  if (isPaletteId(activeId)) {
    const dropZones = args.droppableContainers.filter((c) =>
      isDropZoneId(String(c.id)),
    );
    const byPointer = pointerWithin({
      ...args,
      droppableContainers: dropZones,
    });
    return byPointer.length
      ? byPointer
      : closestCenter({ ...args, droppableContainers: dropZones });
  }

  const blocks = args.droppableContainers.filter(
    (c) => !isDropZoneId(String(c.id)),
  );
  return closestCenter({ ...args, droppableContainers: blocks });
};
