import { clientFetch } from "@/lib/api-client";
import { isStandalone } from "@/lib/push";

const REPORTED_KEY = "usage-reported";

export function detectPlatform(): "ios" | "android" | "desktop" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return ua ? "desktop" : "other";
}

export async function reportUsageOncePerSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(REPORTED_KEY)) return;
  // Set the flag FIRST so a failure (e.g. anonymous → 401) never re-fires.
  sessionStorage.setItem(REPORTED_KEY, "1");
  try {
    await clientFetch<void>("/api/v1/me/usage/", {
      method: "POST",
      body: JSON.stringify({ mode: isStandalone() ? "pwa" : "browser", platform: detectPlatform() }),
    });
  } catch {
    // Telemetry must never affect the page.
  }
}
