import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Never cache auth, billing/checkout, or third-party payment/chat traffic.
// These match first, so defaultCache never sees them.
const NEVER_CACHE: RegExp[] = [
  /^\/admin(\/|$)/,
  /^\/checkout(\/|$)/,
  /^\/api\/v1\/(auth|billing)(\/|$)/,
];
const NEVER_CACHE_HOSTS: readonly string[] = [
  "stripe.com",
  "stream-io-api.com",
  "getstream.io",
];

const guardedCache: RuntimeCaching[] = [
  {
    matcher({ url, sameOrigin }) {
      if (!sameOrigin)
        return NEVER_CACHE_HOSTS.some(
          (h) => url.hostname === h || url.hostname.endsWith("." + h),
        );
      return NEVER_CACHE.some((re) => re.test(url.pathname));
    },
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: guardedCache,
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return JSON.parse(event.data?.text() ?? "{}");
    } catch {
      return {};
    }
  })();
  const title = data.title ?? "Notification";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? "",
      icon: data.icon ?? "/pwa-icon?size=192",
      badge: "/pwa-icon?size=192",
      tag: data.tag,
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client)
            await (client as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
