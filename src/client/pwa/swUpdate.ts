import { registerSW } from "virtual:pwa-register";

// Service worker registration + update detection for the PWA.
//
// vite.config.ts uses registerType: "prompt", so a newly deployed service worker is
// detected but NOT activated automatically. We track that state here and expose it to
// React (see hooks/usePWAUpdate.ts); the page only reloads onto the new build when the
// user clicks "Reload" in the banner. This avoids reloading out from under someone
// mid-action (composing a message, filling a form, uploading to Xenbox).

let needRefresh = false;
let listener: (() => void) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh = true;
    listener?.();
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    swRegistration = registration;
    // Re-check for a new version whenever the app is opened or regains focus. In prompt
    // mode this surfaces the banner rather than reloading. Important for installed PWAs,
    // where reopening often resurfaces the existing page instead of triggering a fresh
    // navigation that would check on its own.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") registration.update();
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    // iOS restores apps from bfcache on resume; pageshow fires where visibilitychange may not.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) registration.update();
    });
  },
});

export function subscribeNeedRefresh(cb: () => void) {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

export function getNeedRefresh() {
  return needRefresh;
}

export function applyUpdate() {
  const waiting = swRegistration?.waiting;
  if (!waiting) {
    // No waiting SW tracked yet; fall back to vite-plugin-pwa's handler.
    updateSW(true);
    return;
  }

  // On iOS standalone, window.location.reload() can silently fail after skipWaiting because
  // the SW statechange event that vite-plugin-pwa relies on doesn't always fire. Instead:
  // - listen for controllerchange, which fires when the new SW calls clients.claim()
  //   (enabled via clientsClaim: true in vite.config.ts workbox options)
  // - use href assignment rather than reload() — more reliable in iOS standalone mode
  // - fall back to a timeout in case controllerchange is delayed or missing
  let reloaded = false;
  const doReload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.href = window.location.href;
  };

  navigator.serviceWorker.addEventListener("controllerchange", doReload, { once: true });
  setTimeout(doReload, 3000);

  waiting.postMessage({ type: "SKIP_WAITING" });
}
