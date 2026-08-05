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
