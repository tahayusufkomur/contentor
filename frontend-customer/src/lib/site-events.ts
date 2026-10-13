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

/** Window event carrying what the assistant just applied ({kind, id}), or
 * {kind: "undo:<kind>", id} when one of its changes was taken back, so the
 * admin page showing that record or list can reload it. */
const ASSISTANT_APPLIED_EVENT = "contentor:assistant-applied";

export interface AssistantApplied {
  kind: string;
  id?: number;
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
