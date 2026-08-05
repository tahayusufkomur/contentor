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
]);

/** Distinguishes content-creation actions (new draft, gets a "view" link)
 * from site-edit actions (existing page content updated in place). */
export const isCreateKind = (kind: string) => CREATE_KINDS.has(kind);
