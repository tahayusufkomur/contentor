import { clientFetch } from "@/lib/api-client";
import { isStandalone } from "@/lib/push";

const REPORTED_KEY = "usage-reported";

export function detectPlatform(): "ios" | "android" | "desktop" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS asks for the desktop site, so its UA says Macintosh; only the touch
  // screen gives it away.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/android/i.test(ua)) return "android";
  return ua ? "desktop" : "other";
}

/** Instagram, Facebook, TikTok… open links in their own browser, which can't
 * add a site to the home screen: the student has to open it in Safari/Chrome. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /instagram|fban|fbav|fb_iab|tiktok|musical_ly|bytedancewebview|linkedinapp|snapchat|pinterest/i.test(
    navigator.userAgent || "",
  );
}

export async function reportUsageOncePerSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(REPORTED_KEY)) return;
  // Set the flag FIRST so a failure (e.g. anonymous → 401) never re-fires.
  sessionStorage.setItem(REPORTED_KEY, "1");
  try {
    await clientFetch<void>("/api/v1/me/usage/", {
      method: "POST",
      body: JSON.stringify({
        mode: isStandalone() ? "pwa" : "browser",
        platform: detectPlatform(),
      }),
    });
  } catch {
    // Telemetry must never affect the page.
  }
}
