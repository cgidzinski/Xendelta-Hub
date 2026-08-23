/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

// Hand-written service worker (vite.config.ts uses strategies: "injectManifest").
//
// We own this file rather than letting Workbox generate it because a generated worker cannot
// carry a "push" listener. Everything the previous generateSW config tuned is reproduced
// below — read the comments before changing any of it, they encode real bug fixes.

// Precache hashed static assets so repeat loads are fast and the app is installable.
// This app requires a network connection to be useful, so there is intentionally NO offline
// navigation fallback and no runtime caching of API/data requests — navigations and /api/
// calls always go straight to the server.
//
// Critically, we register no NavigationRoute at all. A SPA navigation fallback would serve
// cached index.html for ALL navigations, hijacking full-page navigations to /api/auth/* and
// breaking OAuth.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Immediately claim existing clients after skipWaiting so the controllerchange event fires on
// the open tab — required for the iOS-compatible reload in swUpdate.ts.
clientsClaim();

// registerType is "prompt": never call skipWaiting() on install. The new worker waits until
// the user clicks Reload in UpdateBanner, so we never reload out from under someone
// mid-action (composing a message, filling a form, uploading to Xenbox).
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// --- Web Push ---------------------------------------------------------------------------

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  notificationId?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // A push with a non-JSON (or empty) body still has to show something — see below.
    payload = { body: event.data?.text() };
  }

  const title = payload.title || "Xendelta Hub";

  // ALWAYS show a notification, on every push, even when a tab is focused. iOS treats a
  // received-but-not-shown push as a violation of userVisibleOnly and will silently revoke
  // the subscription. Do not add "suppress while the app is open" logic here.
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
      tag: payload.notificationId,
      data: { url: payload.url || "/internal/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || "/internal/notifications", self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Prefer reusing an already-open window: opening a second one would lose the user's
      // place and start a fresh socket connection.
      const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && client.url !== target) {
            await client.navigate(target).catch(() => {});
          }
          return;
        }
      }

      await self.clients.openWindow(target);
    })()
  );
});
