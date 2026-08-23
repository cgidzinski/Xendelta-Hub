const Notification = require("../models/notification");
const { User } = require("../models/user");
import { SocketManager } from "../infrastructure/SocketManager";
import { sendPushToUser } from "./pushUtils";
import { sendNotificationEmail } from "./emailUtils";

// Multi-channel notification dispatch.
//
// A single event fans out to whichever channels the caller asks for:
//   inapp  - persist a Notification document (the bell / inbox list)
//   socket - emit notification:new to live clients over Socket.IO
//   email  - send via Resend (respects user.notificationPrefs.email)
//   push   - Web Push to the user's subscribed devices (phone lock screen)
//
// Channels are independent: one failing never blocks the others, matching the original
// swallow-and-log behaviour so a notification failure can't break the action that caused it.

export type NotifyChannel = "inapp" | "socket" | "email" | "push";

export interface NotifyInput {
  title: string;
  message: string;
  link?: string;
  /** MUI icon key rendered by the inbox UI. */
  icon?: string;
  channels?: NotifyChannel[];
}

export interface NotifyResult {
  inapp: boolean;
  socket: boolean;
  email: boolean;
  push: { sent: number; pruned: number };
}

export const DEFAULT_CHANNELS: NotifyChannel[] = ["inapp", "socket", "push"];

export async function notify(userId: string, input: NotifyInput): Promise<NotifyResult> {
  const { title, message, link, icon = "announcement", channels = DEFAULT_CHANNELS } = input;

  const result: NotifyResult = {
    inapp: false,
    socket: false,
    email: false,
    push: { sent: 0, pruned: 0 },
  };

  const wants = (channel: NotifyChannel) => channels.includes(channel);

  // Stamped once so the persisted document and the socket payload carry the same time.
  const time = new Date().toISOString();

  // The inapp channel runs first and alone: its saved _id is what the socket payload carries
  // and what the push payload references, so the client can deep-link and mark-read.
  let notificationId: string | undefined;

  if (wants("inapp")) {
    try {
      const doc = new Notification({
        userId,
        title,
        message,
        time,
        icon,
        unread: true,
        link,
      });
      await doc.save();
      notificationId = doc._id.toString();
      result.inapp = true;
    } catch (e) {
      console.error("Notification (inapp) failed:", e);
    }
  }

  // NOTE: "socket" without "inapp" emits a payload with no persisted _id. The client keys its
  // notification cache on _id and marks read via PUT /api/user/notifications/:id/mark-read,
  // so such a notification cannot be marked read — keep the two together unless you
  // deliberately want an ephemeral, non-persisted toast.
  const tasks: Promise<void>[] = [];

  if (wants("socket")) {
    tasks.push(
      (async () => {
        try {
          SocketManager.getInstance().sendNotification(userId, {
            _id: notificationId,
            title,
            message,
            time,
            icon,
            unread: true,
            link,
          } as any);
          result.socket = true;
        } catch (e) {
          console.error("Notification (socket) failed:", e);
        }
      })()
    );
  }

  if (wants("push")) {
    tasks.push(
      (async () => {
        try {
          result.push = await sendPushToUser(userId, {
            title,
            body: message,
            url: link,
            notificationId,
          });
        } catch (e) {
          console.error("Notification (push) failed:", e);
        }
      })()
    );
  }

  if (wants("email")) {
    tasks.push(
      (async () => {
        try {
          const user = await User.findById(userId).select("email username notificationPrefs").exec();
          if (!user?.email) return;
          if (user.notificationPrefs?.email !== true) return;

          const { success, error } = await sendNotificationEmail({
            username: user.username || "there",
            email: user.email,
            title,
            message,
            link,
          });

          if (success) result.email = true;
          else console.error("Notification (email) failed:", error);
        } catch (e) {
          console.error("Notification (email) failed:", e);
        }
      })()
    );
  }

  await Promise.allSettled(tasks);

  return result;
}
