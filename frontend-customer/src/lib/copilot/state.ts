import type { ChatEntry, CopilotDone } from "./types";

const TRANSCRIPT_MAX = 20;

/** Append the assistant's turn. Unavailable turns become a marker entry the
 * UI translates into the "assistant is resting" bubble. */
export function reduceChat(entries: ChatEntry[], done: CopilotDone): ChatEntry[] {
  if (done.kind === "unavailable") {
    return [...entries, { role: "assistant", text: "__unavailable__" }];
  }
  return [...entries, { role: "assistant", text: done.text ?? "", cards: done.actions }];
}

/** The stateless-server contract: transcript travels with each request. */
export function toTranscript(entries: ChatEntry[]): { role: string; text: string }[] {
  return entries.slice(-TRANSCRIPT_MAX).map((e) => ({ role: e.role, text: e.text }));
}
