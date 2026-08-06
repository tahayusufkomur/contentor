import type { ChatEntry, CopilotDone } from "./types";

const TRANSCRIPT_MAX = 20;
const UNAVAILABLE_MARKER = "__unavailable__";

/** Append the assistant's turn. Unavailable turns become a marker entry the
 * UI translates into the "assistant is resting" bubble. */
export function reduceChat(
  entries: ChatEntry[],
  done: CopilotDone,
): ChatEntry[] {
  if (done.kind === "unavailable") {
    return [...entries, { role: "assistant", text: UNAVAILABLE_MARKER }];
  }
  return [
    ...entries,
    {
      role: "assistant",
      text: done.text ?? "",
      cards: done.actions,
      kind: done.kind,
    },
  ];
}

/** The stateless-server contract: transcript travels with each request.
 * The unavailable-turn marker is UI-only and must never reach the model. */
export function toTranscript(
  entries: ChatEntry[],
): { role: string; text: string; kind?: string }[] {
  return entries
    .filter((e) => e.text !== UNAVAILABLE_MARKER)
    .slice(-TRANSCRIPT_MAX)
    .map((e) =>
      e.kind
        ? { role: e.role, text: e.text, kind: e.kind }
        : { role: e.role, text: e.text },
    );
}

const CREATE_KINDS = new Set([
  "create_course",
  "create_event",
  "create_blog_post",
  "draft_announcement",
]);

/** Distinguishes content-creation actions (new draft, gets a "view" link)
 * from site-edit actions (existing page content updated in place). */
export const isCreateKind = (kind: string) => CREATE_KINDS.has(kind);

const NOT_UNDOABLE_KINDS = new Set([
  ...CREATE_KINDS,
  "edit_course",
  "edit_event",
  "edit_blog_post",
  "publish_course",
  "publish_blog_post",
]);

/** Server-side, these kinds record an empty inverse ({}) — undo would always
 * 400. Gate the Undo affordance on this client-side so we never show a
 * button that's guaranteed to fail. */
export const isUndoableKind = (kind: string) => !NOT_UNDOABLE_KINDS.has(kind);

/** Sequentially run card confirms; stop at the first failure so a broken
 * mid-bundle action never leaves later actions silently un-applied. */
export async function runBundle(
  confirms: (() => Promise<void>)[],
): Promise<{ done: number; failed: boolean }> {
  let done = 0;
  for (const confirm of confirms) {
    try {
      await confirm();
      done += 1;
    } catch {
      return { done, failed: true };
    }
  }
  return { done, failed: false };
}
