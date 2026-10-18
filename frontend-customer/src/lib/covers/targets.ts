// What the photo studio's list says about a course or event series, and what its button does.

import type { DesignTarget } from "@/types/design";

/** What a target wears now: a kept design, a plain photo, nothing, or a draft that waits for her. */
export type TargetState = "designed" | "photo" | "none" | "draft";

/** A draft that waits comes first, even over a kept cover: it is what she goes back to. */
export function targetState(
  target: Pick<DesignTarget, "draft_id" | "cover" | "photo_url">,
): TargetState {
  if (target.draft_id) return "draft";
  if (target.cover) return "designed";
  return target.photo_url ? "photo" : "none";
}

/** The one thing a row's button does. `from` is the kept design a new draft is copied from; it is
 *  sent only for a target that wears one and has no draft (`open_draft` ignores it otherwise). */
export function targetAction(
  target: Pick<DesignTarget, "draft_id" | "cover" | "photo_url">,
): { key: "design" | "continue" | "editCopy"; from?: string } {
  switch (targetState(target)) {
    case "draft":
      return { key: "continue" };
    case "designed":
      return { key: "editCopy", from: target.cover?.id };
    default:
      return { key: "design" };
  }
}
