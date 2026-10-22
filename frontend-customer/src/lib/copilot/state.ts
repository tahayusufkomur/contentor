import type { RunState } from "./runs";
import type { SpecialistKey } from "./team";
import type { ChatEntry, CopilotDone } from "./types";

const TRANSCRIPT_MAX = 20;
const UNAVAILABLE_MARKER = "__unavailable__";

/** The assistant's turn as a chat entry. Unavailable turns become a marker
 * entry the UI translates into the "assistant is resting" bubble. */
function replyEntry(done: CopilotDone): ChatEntry {
  if (done.kind === "unavailable") {
    return { role: "assistant", text: UNAVAILABLE_MARKER };
  }
  return {
    role: "assistant",
    text: done.text ?? "",
    cards: done.actions,
    kind: done.kind,
    ...(done.specialist ? { specialist: done.specialist } : {}),
  };
}

/** Append the assistant's turn. */
export function reduceChat(
  entries: ChatEntry[],
  done: CopilotDone,
): ChatEntry[] {
  return [...entries, replyEntry(done)];
}

/** Where a reply will appear while its run works on it. */
export function pendingEntry(
  run: number,
  specialist: SpecialistKey,
): ChatEntry {
  return { role: "assistant", text: "", kind: "pending", run, specialist };
}

/** Put a finished run's outcome where its pending entry stood. Entries
 * without that run come back as they are (the same array), so a run never
 * writes into a chat it does not belong to. */
export function resolveRun(
  entries: ChatEntry[],
  run: RunState,
  notes: { stopped: string; failed: string },
): ChatEntry[] {
  const at = entries.findIndex((e) => e.kind === "pending" && e.run === run.id);
  if (at < 0) return entries;
  let entry: ChatEntry;
  if (run.status === "done" && run.reply) {
    entry = { ...replyEntry(run.reply), run: run.id };
  } else if (run.status === "stopped") {
    entry = note("stopped", notes.stopped, run);
  } else if (run.status === "failed" || run.status === "done") {
    entry = note("failed", notes.failed, run);
  } else {
    return entries;
  }
  return [...entries.slice(0, at), entry, ...entries.slice(at + 1)];
}

function note(
  kind: "stopped" | "failed",
  text: string,
  run: RunState,
): ChatEntry {
  return {
    role: "assistant",
    text,
    kind,
    specialist: run.specialist,
    run: run.id,
  };
}

/** UI notes in the chat that are not part of the conversation. */
const NOTE_KINDS = new Set(["pending", "stopped", "failed"]);

/** The stateless-server contract: transcript travels with each request.
 * The unavailable-turn marker is UI-only and must never reach the model.
 * Attached photos are folded into the text as an [attached ...] note so the
 * model can still use their photo_ids on follow-up turns. */
export function toTranscript(
  entries: ChatEntry[],
): { role: string; text: string; kind?: string }[] {
  return entries
    .filter(
      (e) =>
        e.text !== UNAVAILABLE_MARKER && !(e.kind && NOTE_KINDS.has(e.kind)),
    )
    .slice(-TRANSCRIPT_MAX)
    .map((e) => {
      const note = e.attached?.length
        ? `\n[attached photos: ${e.attached
            .map(
              (p) =>
                `photo_id=${p.id} '${p.title || "untitled"}'${p.desc ? ` — ${p.desc}` : ""}`,
            )
            .join(", ")}]`
        : "";
      const text = e.text + note;
      return e.kind
        ? { role: e.role, text, kind: e.kind }
        : { role: e.role, text };
    });
}

const CREATE_KINDS = new Set([
  "create_course",
  "create_event",
  "create_blog_post",
  "draft_announcement",
  "draft_email",
]);

/** Distinguishes content-creation actions (new draft, gets a "view" link)
 * from site-edit actions (existing page content updated in place). */
export const isCreateKind = (kind: string) => CREATE_KINDS.has(kind);

const NOT_UNDOABLE_KINDS = new Set([
  "edit_course",
  "edit_curriculum",
  "edit_event",
  "edit_blog_post",
  "publish_course",
  "publish_blog_post",
]);

/** Server-side, these kinds record an empty inverse ({}) — undo would always
 * 400. Gate the Undo affordance on this client-side so we never show a
 * button that's guaranteed to fail. A created draft can be undone: that
 * deletes it while she has not touched it. */
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
