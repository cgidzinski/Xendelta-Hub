import webpush from "web-push";
const PushSubscription = require("../models/pushSubscription");

// Web Push (VAPID) delivery. Every browser hardcodes its own push service — Chrome/Android
// route through FCM, Safari/iOS through Apple, Firefox through Mozilla — and the endpoint
// stored on each subscription already points at the right one. Sending is therefore a single
// authenticated POST per device with no per-platform branching.

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  notificationId?: string;
}

export interface PushResult {
  sent: number;
  pruned: number;
}

// Phones truncate long text anyway, and the encrypted payload has a ~4KB ceiling.
const MAX_BODY_LENGTH = 200;

let vapidState: "unconfigured" | "ready" | "missing" = "unconfigured";

/**
 * Configure web-push on first use. Returns false when VAPID keys are absent (local dev),
 * so callers can no-op instead of throwing on every notification.
 */
function ensureVapid(): boolean {
  if (vapidState === "ready") return true;
  if (vapidState === "missing") return false;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:no-reply@xendelta.com";

  if (!publicKey || !privateKey) {
    vapidState = "missing";
    console.warn(">>> VAPID keys not set — push notifications disabled. Run `npx web-push generate-vapid-keys`.");
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidState = "ready";
  return true;
}

export function isPushConfigured(): boolean {
  return ensureVapid();
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Push to every device the user has subscribed. Failures are isolated per device: a dead
 * subscription is deleted (the browser has dropped it), anything else is logged and left
 * alone so a transient push-service outage doesn't discard a valid device.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  if (!ensureVapid()) return { sent: 0, pruned: 0 };

  const subscriptions = await PushSubscription.find({ userId }).exec();
  if (subscriptions.length === 0) return { sent: 0, pruned: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: truncate(payload.body, MAX_BODY_LENGTH),
    url: payload.url,
    notificationId: payload.notificationId,
  });

  let sent = 0;
  let pruned = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          body
        );
        return { ok: true as const };
      } catch (err: any) {
        // 404/410 mean the browser has permanently dropped this subscription.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
          return { ok: false as const, pruned: true };
        }
        // web-push's own WebPushError carries statusCode/body only once a push service has
        // actually responded with an HTTP error. Anything that fails before that (DNS,
        // connection refused, a malformed subscription, an invalid VAPID key) is a plain
        // Error with neither — logging just those two fields prints "undefined undefined"
        // and gives no way to tell which device even failed. Log the endpoint plus whatever
        // the error actually has.
        console.error(
          "Push send failed:",
          sub.endpoint,
          err?.statusCode !== undefined ? `HTTP ${err.statusCode}` : "(no HTTP response)",
          err?.body || err?.message || err
        );
        return { ok: false as const, pruned: false };
      }
    })
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    if (result.value.ok) sent++;
    else if (result.value.pruned) pruned++;
  }

  return { sent, pruned };
}
