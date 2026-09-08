import { registerSW } from "virtual:pwa-register";

// Service worker registration + update detection for the PWA.
//
// vite.config.ts uses registerType: "prompt", so a newly deployed service worker is
// detected but NOT activated automatically. We track that state here and expose it to
// React (see hooks/usePWAUpdate.ts); the page only reloads onto the new build when the
// user clicks "Reload" in the banner. This avoids reloading out from under someone
// mid-action (composing a message, filling a form, uploading to Xenbox).
//
// needRefresh mirrors "is a worker sitting in `waiting`?" and is re-derived from the live
// registration - it is deliberately NOT a latch. An earlier version only ever set it to
// true, which could strand the banner permanently: anything that cleared `waiting` without
// a controllerchange (a replacement worker failing to install, or iOS evicting the
// registration) left the flag stuck on, and applyUpdate's no-waiting-worker path called
// vite-plugin-pwa's updateServiceWorker(), which only messages a waiting worker and never
// reloads on its own. With none to message it did nothing at all, so the banner stayed up
// with a dead Reload button and force-quitting the app was the only way out.

let needRefresh = false;
const listeners = new Set<() => void>();
let swRegistration: ServiceWorkerRegistration | null = null;
let reloading = false;
let lastCheck = 0;

/** Don't re-fetch the worker on every single focus event; the app can fire these in bursts. */
const UPDATE_CHECK_INTERVAL_MS = 60_000;
/** Last-resort reload if activation never reports back. */
const ACTIVATION_TIMEOUT_MS = 10_000;

function setNeedRefresh(next: boolean) {
  if (needRefresh === next) return;
  needRefresh = next;
  listeners.forEach((listener) => listener());
}

/** Re-derive the banner from the registration rather than trusting our own past state. */
function reconcile() {
  const registration = swRegistration;
  if (!registration) return;
  if (registration.waiting) {
    setNeedRefresh(true);
    return;
  }
  // A worker mid-install hasn't decided yet - leave the banner alone rather than
  // flickering it off and straight back on.
  if (registration.installing) return;
  setNeedRefresh(false);
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    // Comes from workbox-window's "waiting" event, which it can dispatch before
    // onRegisteredSW has handed us the registration - so trust it directly rather than
    // reconciling against a swRegistration that may still be null.
    setNeedRefresh(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    swRegistration = registration;
    // A worker may already have been waiting before this script ran.
    reconcile();

    // A replacement worker discards the one that was waiting; if it then fails to install
    // (a precache entry 404s, say) it goes redundant and `waiting` is cleared without any
    // controllerchange ever firing. Watching the install is what keeps the banner honest
    // in that case.
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", reconcile);
      reconcile();
    });

    // A new worker taking control means this prompt is obsolete. Only clear the flag here:
    // vite-plugin-pwa already reloads on its own "controlling" event, and reloading here
    // too would loop on a first-ever install, where sw.ts's clientsClaim() fires
    // controllerchange with no update involved.
    navigator.serviceWorker.addEventListener("controllerchange", () => setNeedRefresh(false));

    // Re-check whenever the app is opened or regains focus. In prompt mode this surfaces
    // the banner rather than reloading. Important for installed PWAs, where reopening
    // often resurfaces the existing page instead of triggering a fresh navigation that
    // would check on its own.
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      // Cheap re-derive first - this is what clears a banner whose worker has since gone.
      reconcile();
      if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      // Rejects when offline; swallow it rather than letting it surface as an unhandled
      // rejection in Bugsnag.
      registration.update().then(reconcile).catch(() => {});
    };
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
    // iOS restores apps from bfcache on resume; pageshow fires where visibilitychange may
    // not, and the restored document still carries this module's old state.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) checkForUpdate();
    });
  },
});

export function subscribeNeedRefresh(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getNeedRefresh() {
  return needRefresh;
}

function hardReload() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
  // On iOS standalone reload() can silently do nothing. If we're still running two
  // seconds later it didn't take, so force a real navigation. Note this drops any
  // fragment on purpose - assigning an identical href is a no-op when the URL has one,
  // which is why the old `location.href = location.href` trick was unreliable.
  window.setTimeout(() => {
    window.location.replace(window.location.pathname + window.location.search);
  }, 2000);
}

export function applyUpdate() {
  const waiting = swRegistration?.waiting;

  if (!waiting) {
    // Nothing is actually waiting, so the banner is stale. Clear it and still navigate -
    // the one thing this must never do is leave the click doing nothing.
    setNeedRefresh(false);
    hardReload();
    return;
  }

  // Reload only once the new worker is genuinely in charge. A navigation to "/" is served
  // out of the precache (workbox resolves it to the precached index.html via its
  // directoryIndex default), so reloading before the new worker activates would just
  // re-serve the OLD build and quietly leave the user on the version they wanted off.
  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated") hardReload();
  });
  navigator.serviceWorker.addEventListener("controllerchange", hardReload, { once: true });
  window.setTimeout(hardReload, ACTIVATION_TIMEOUT_MS);

  waiting.postMessage({ type: "SKIP_WAITING" });
}
