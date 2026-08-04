import type { SelectionPayload } from "./types";

/** Structural subset of Element so unit tests can pass plain objects. */
export interface SelectableElement {
  tagName: string;
  textContent: string | null;
  closest: (selector: string) => { getAttribute(name: string): string | null } | null;
  parentElement: { textContent: string | null } | null;
}

const TEXT_MAX = 200;
const CONTEXT_MAX = 120;

export function buildSelectionPayload(el: SelectableElement, path: string): SelectionPayload {
  const host = el.closest("[data-block-id]");
  return {
    path,
    block_id: host?.getAttribute("data-block-id") ?? null,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").trim().slice(0, TEXT_MAX),
    context: (el.parentElement?.textContent ?? "").trim().slice(0, CONTEXT_MAX),
  };
}
