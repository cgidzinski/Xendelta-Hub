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

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh = true;
    listener?.();
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Re-check for a new version whenever the app is opened or regains focus. In prompt
    // mode this surfaces the banner rather than reloading. Important for installed PWAs,
    // where reopening often resurfaces the existing page instead of triggering a fresh
    // navigation that would check on its own.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") registration.update();
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
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
  // reloadPage = true: activate the waiting service worker and reload onto the new build.
  return updateSW(true);
}
