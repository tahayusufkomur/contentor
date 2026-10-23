import { clientFetch } from "@/lib/api-client";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr.buffer as ArrayBuffer;
}

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

export async function subscribeToPush(): Promise<boolean> {
  if (Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  return saveSubscription();
}

/** Reuses this browser's subscription (or makes one) and stores it for the
 * signed-in user; the server upserts by endpoint. */
async function saveSubscription(): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { public_key } = await clientFetch<{ public_key: string }>(
      "/api/v1/notifications/vapid-key/",
    );
    if (!public_key) return false;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    });
  }

  await clientFetch<void>("/api/v1/notifications/subscribe/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return true;
}

const SYNCED_KEY = "push-synced";

/** Once per session, re-sends the subscription of a browser that already
 * allows notifications: iOS can drop a subscription silently, and a grant made
 * before signing in never reached the server. */
export async function syncPushOncePerSession(): Promise<void> {
  if (sessionStorage.getItem(SYNCED_KEY)) return;
  sessionStorage.setItem(SYNCED_KEY, "1");
  try {
    await saveSubscription();
  } catch {
    // Best effort; the next session tries again.
  }
}
