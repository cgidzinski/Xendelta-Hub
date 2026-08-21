import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

// Web Push subscribe/unsubscribe for the current device.
//
// One subscription per browser+device: the same account on a phone and a laptop produces two
// server-side rows. The push service the subscription points at is chosen by the browser
// (FCM on Chrome/Android, Apple on iOS, Mozilla on Firefox) — nothing here is platform-specific.

interface UsePushNotificationsReturn {
  /** The browser exposes the Push API at all. */
  supported: boolean;
  /** iOS Safari that has not been installed to the Home Screen — push is impossible until it is. */
  needsInstall: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  isBusy: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

// The VAPID public key is delivered as base64url and the Push API wants raw bytes.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  // Backed by an explicit ArrayBuffer: applicationServerKey requires a BufferSource over a
  // plain ArrayBuffer, which the bare Uint8Array constructor no longer guarantees.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function detectSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function detectNeedsInstall(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  if (!isIOS) return false;
  // iOS only exposes the Push API to a Home Screen app; in plain Safari the whole API is
  // missing, so prompting for permission there would fail with no useful explanation.
  return !window.matchMedia("(display-mode: standalone)").matches;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const supported = detectSupported();
  const needsInstall = detectNeedsInstall();

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported"
  );
  const [subscribed, setSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reflect the device's existing subscription on mount, so the toggle opens in the right state.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!existing);
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  // Must be called from a user gesture — both Safari and Chrome reject a permission request
  // that isn't tied to a click.
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setError("This browser does not support push notifications.");
      return false;
    }
    if (needsInstall) {
      setError("On iPhone, add Xendelta Hub to your Home Screen first.");
      return false;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== "granted") {
        setError(
          result === "denied"
            ? "Notifications are blocked. Enable them for this site in your browser settings."
            : "Notification permission was dismissed."
        );
        return false;
      }

      const keyResponse = await apiClient.get<ApiResponse<{ publicKey: string }>>("/api/push/public-key");
      const publicKey = keyResponse.data.data?.publicKey;
      if (!publicKey) {
        setError("Push notifications are not configured on this server.");
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse the device's existing subscription when there is one; subscribing twice with a
      // different applicationServerKey throws.
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          // Required by every browser, and iOS revokes subscriptions that receive a push
          // without showing a notification — the service worker always shows one.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      await apiClient.post("/api/push/subscribe", {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });

      setSubscribed(true);
      return true;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Could not enable push notifications.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [supported, needsInstall]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;

    setIsBusy(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Drop the server row first: if unsubscribe() succeeds but the request fails, the
        // server would keep pushing to a dead endpoint until the 410 prune catches it.
        await apiClient.delete("/api/push/subscribe", { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }

      setSubscribed(false);
      return true;
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Could not disable push notifications.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [supported]);

  return { supported, needsInstall, permission, subscribed, isBusy, error, subscribe, unsubscribe };
}
