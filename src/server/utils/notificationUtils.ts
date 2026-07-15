const Notification = require("../models/notification");
import { SocketManager } from "../infrastructure/SocketManager";

export async function notify(userId: string, title: string, message: string, link?: string, icon = "announcement") {
  try {
    const n = new Notification({ userId, title, message, time: new Date().toISOString(), icon, unread: true, link });
    await n.save();
    SocketManager.getInstance().sendNotification(userId, n);
  } catch (e) { console.error("Notification failed:", e); }
}
