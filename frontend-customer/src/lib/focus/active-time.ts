// Her active time on a creation: only while the tab is visible (spec §6
// item 6). Module state, so it survives the client navigation from
// /admin/courses/new to the course page. Keys: "focus:course" for focus
// mode, "form:new-course" for the plain form.

export interface Span {
  total: number;
  since: number | null;
}

export function accumulate(
  prev: Span,
  event: "visible" | "hidden",
  now: number,
): Span {
  if (event === "visible")
    return prev.since === null ? { ...prev, since: now } : prev;
  if (prev.since === null) return prev;
  return { total: prev.total + (now - prev.since), since: null };
}

const spans = new Map<string, Span>();
let listening = false;

const visible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

function listen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    const event = visible() ? "visible" : "hidden";
    const now = Date.now();
    spans.forEach((span, key) => spans.set(key, accumulate(span, event, now)));
  });
}

/** Start counting for ``key``; an already running count goes on unless
 *  ``restart`` (a new creation from its entry page). */
export function startActiveTime(key: string, restart = false) {
  listen();
  if (spans.has(key) && !restart) return;
  spans.set(key, { total: 0, since: visible() ? Date.now() : null });
}

/** The active time since the last take, then counting starts again from 0. */
export function takeActiveMs(key: string): number {
  const span = spans.get(key);
  if (!span) return 0;
  const now = Date.now();
  const total = span.total + (span.since === null ? 0 : now - span.since);
  spans.set(key, { total: 0, since: span.since === null ? null : now });
  return Math.max(0, Math.round(total));
}

/** Stop counting (finished, or left): a later start begins from 0. */
export function stopActiveTime(key: string) {
  spans.delete(key);
}
