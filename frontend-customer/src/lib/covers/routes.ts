// Where the photo studio lives, and the tools of its desktop rail.

/** A design's editor, `/admin/studio/<id>`: not the studio's list, which has no id after it. While she is
 *  in it the admin's own navigation shrinks to icons, so the editor has the room. */
export const isStudioEditor = (pathname: string): boolean =>
  /^\/admin\/studio\/[^/]+\/?$/.test(pathname);

/** The tools of the editor's rail, top to bottom. `generate` ("New photo") is not a drawer of its own: it
 *  opens Photos on its New tab. `edit` is what she does to the cover's photo (filters, its frame, the photo
 *  tools). */
export const STUDIO_TOOLS = [
  "layouts",
  "photos",
  "edit",
  "text",
  "elements",
  "brand",
  "uploads",
  "generate",
] as const;

export type StudioTool = (typeof STUDIO_TOOLS)[number];
