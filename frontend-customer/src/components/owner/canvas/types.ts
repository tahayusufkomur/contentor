// Drag-and-drop id namespacing so a single DndContext can host two different
// operations: reordering existing blocks (draggable id = the raw block id) and
// inserting a new block from the palette onto a drop zone.

const PALETTE_PREFIX = "palette:";
const DROPZONE_PREFIX = "dropzone:";

/** Draggable id for a palette entry of the given block type. */
export const paletteDragId = (type: string): string =>
  `${PALETTE_PREFIX}${type}`;
export const isPaletteId = (id: string): boolean =>
  id.startsWith(PALETTE_PREFIX);
export const paletteTypeFromId = (id: string): string =>
  id.slice(PALETTE_PREFIX.length);

/** Droppable id for the insertion slot at `index` on a page. */
export const dropZoneId = (pageKey: string, index: number): string =>
  `${DROPZONE_PREFIX}${pageKey}:${index}`;
export const isDropZoneId = (id: string): boolean =>
  id.startsWith(DROPZONE_PREFIX);
export const dropZoneIndexFromId = (id: string): number => {
  const n = Number(id.slice(DROPZONE_PREFIX.length).split(":").pop());
  return Number.isNaN(n) ? 0 : n;
};
