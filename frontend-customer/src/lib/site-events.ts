import { useEffect, useRef } from "react";

/** Window event announcing that the tenant's site config changed on the
 * server outside the editor's own save path (copilot apply). EditSidebar
 * listens and re-pulls config so the coach's live canvas repaints in place —
 * no page reload, chat and editor state survive. */
export const SITE_UPDATED_EVENT = "contentor:site-updated";

export function announceSiteUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SITE_UPDATED_EVENT));
  }
}

/** The editor opened in the setup review's frame (/page?embed=edit) puts this
 * on its own window, so the review (same origin) can have every edit saved
 * before it closes the frame. ``path`` is the page the editor ended on. */
export const EMBEDDED_EDITOR = "contentorEmbeddedEditor";
export interface EmbeddedEditorApi {
  finish: () => Promise<{ ok: boolean; path: string }>;
}

/** Window event carrying what the assistant just applied ({kind, id}), or
 * {kind: "undo:<kind>", id} when one of its changes was taken back, so the
 * admin page showing that record or list can reload it. */
const ASSISTANT_APPLIED_EVENT = "contentor:assistant-applied";

export interface AssistantApplied {
  kind: string;
  id?: number;
  /** edit_email: the Designer's run, and which kind of email it changes. */
  job?: number;
  target?: "campaign" | "template";
}

export function announceAssistantApplied(result: AssistantApplied): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AssistantApplied>(ASSISTANT_APPLIED_EVENT, {
        detail: result,
      }),
    );
  }
}

/** Run `handler` whenever the assistant applies or undoes something. */
export function useAssistantApplied(
  handler: (applied: AssistantApplied) => void,
): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const onApplied = (event: Event) =>
      latest.current((event as CustomEvent<AssistantApplied>).detail);
    window.addEventListener(ASSISTANT_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(ASSISTANT_APPLIED_EVENT, onApplied);
  }, []);
}
