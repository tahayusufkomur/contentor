"use client";

// Fire-and-forget page-view beacon. Mounted once per app in the root layout.
// pathname-only on purpose: useSearchParams would force a Suspense boundary
// and CSR bailout in the static marketing layout; server-side query strings
// are captured (redacted) by the activity middleware instead.

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { getSessionId, SESSION_HEADER, shouldTrack } from "./session";

export function TrackPageView() {
  const pathname = usePathname();
  const lastRef = useRef<{ path: string; t: number } | null>(null);
  const prevPathRef = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    if (!shouldTrack(lastRef.current, pathname, now)) return;
    const referrer =
      prevPathRef.current ||
      (typeof document !== "undefined" ? document.referrer : "");
    lastRef.current = { path: pathname, t: now };
    prevPathRef.current = pathname;
    const sid = getSessionId();
    void fetch("/api/v1/track/pageview/", {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(sid ? { [SESSION_HEADER]: sid } : {}),
      },
      body: JSON.stringify({ path: pathname, referrer }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
