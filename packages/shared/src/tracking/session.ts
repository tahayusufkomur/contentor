// Per-tab session identity for journey stitching. sessionStorage-scoped by
// design: no persistent identifier for anonymous visitors (privacy stance in
// the logbook spec).

export const SESSION_HEADER = "X-Session-Id";
const KEY = "ct_sid";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let sid = window.sessionStorage.getItem(KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      window.sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return ""; // storage blocked (private mode) — track without stitching
  }
}

export function shouldTrack(
  prev: { path: string; t: number } | null,
  path: string,
  now: number,
): boolean {
  return !prev || prev.path !== path || now - prev.t > 1000;
}
