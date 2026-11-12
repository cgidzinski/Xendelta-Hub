import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/user";
import { Conversation } from "../models/conversation";
import { getJwtSecret } from "../config/env";
import type { ClientEvents, RealtimeEvent, RealtimeEvents } from "@shared/realtime";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface JWTPayload {
  _id: string;
  username?: string;
  email?: string;
  avatar?: string;
  iat?: number;
  exp?: number;
}

// What goes over the socket: a notification record (a Mongoose document or a plain object).
interface Notification {
  _id?: unknown;
  title?: string | null;
  message?: string | null;
  time?: string | null;
  icon?: string | null;
  link?: string | null;
  unread?: boolean;
}

export class SocketManager {
  private static instance: SocketManager;
  private io!: SocketIOServer;
  private isInitialized: boolean = false;
  /** When each socket last announced it was typing, so a client can't flood a conversation with typing events. */
  private lastTyping = new Map<string, number>();

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async initialize(io: SocketIOServer): Promise<void> {
    // Prevent duplicate initialization (e.g., during hot reload)
    if (this.isInitialized && this.io === io) {
      return;
    }

    this.io = io;
    this.isInitialized = true;

    // Socket authentication middleware
    io.use(async (socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      try {
        const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;
        const user = await User.findOne({ _id: decoded._id }).exec();

        if (!user) {
          return next(new Error("Authentication error: User not found"));
        }

        socket.userId = user._id.toString();
        socket.username = user.username ?? undefined;
        next();
      } catch (error) {
        return next(new Error("Authentication error: Invalid token"));
      }
    });

    // Connection handler
    io.on("connection", (socket: AuthenticatedSocket) => {
      if (!socket.userId) {
        socket.disconnect();
        return;
      }

      // A person's own room. Every event is sent here, and a person may have several tabs and devices open: each
      // joins it, and none disconnects another. Clients cannot join any other room.
      socket.join(`user:${socket.userId}`);

      socket.on("chat:typing", async (data: ClientEvents["chat:typing"]) => {
        const conversationId = typeof data?.conversationId === "string" ? data.conversationId : "";
        if (!/^[a-f0-9]{24}$/i.test(conversationId)) return;
        const typing = !!data.typing;

        // Starting to type is announced at most once a second per tab; stopping is always passed on.
        if (typing) {
          const now = Date.now();
          if (now - (this.lastTyping.get(socket.id) ?? 0) < 1000) return;
          this.lastTyping.set(socket.id, now);
        }

        // Only members of the conversation hear it, and only members can say it.
        const conversation = await Conversation.findOne(
          { _id: conversationId, "members.user_id": socket.userId },
          "members.user_id",
        )
          .lean()
          .exec();
        if (!conversation) return;
        const others = conversation.members.map((m) => m.user_id).filter((id) => id !== socket.userId);
        this.emitToUsers(others, "chat:typing", {
          conversationId,
          userId: socket.userId!,
          username: socket.username ?? "",
          typing,
        });
      });

      socket.on("disconnect", () => {
        this.lastTyping.delete(socket.id);
      });
    });
  }

  /** Send an event to each person's own room. Prefer `realtime.toUsers` (server/realtime), which types the payload. */
  emitToUsers(userIds: Iterable<string>, event: RealtimeEvent, payload?: unknown): void {
    if (!this.io) return;
    for (const userId of new Set(userIds)) {
      this.io.to(`user:${userId}`).emit(event, payload);
    }
  }

  /** Whether the person has at least one tab connected. */
  isOnline(userId: string): boolean {
    return (this.io?.sockets?.adapter?.rooms?.get(`user:${userId}`)?.size ?? 0) > 0;
  }

  private emit<E extends RealtimeEvent>(userIds: Iterable<string>, event: E, payload?: RealtimeEvents[E]) {
    this.emitToUsers(userIds, event, payload);
  }

  // Send new notification to specific user
  sendNotification(userId: string, notification: Notification) {
    this.emit([userId], "notification:new", { notification });
  }

  // Notify user about notification update (e.g., marked as read, or deleted)
  notifyNotificationUpdate(userId: string, notificationId: string, update: { unread?: boolean; deleted?: boolean }) {
    this.emit([userId], "notification:update", { notificationId, update });
  }

  // Notify group members that a XenSplit group has been updated
  notifyXenSplitGroupUpdate(groupId: string, memberIds: string[]) {
    this.emit(memberIds, "xensplit:group_update", { groupId });
  }

  // Notify users that their groups list has changed (e.g. added to a new group)
  notifyXenSplitGroupsUpdated(memberIds: string[]) {
    this.emit(memberIds, "xensplit:groups_updated");
  }

  // Notify book members that a XenBudget book changed. This is what keeps the monthly
  // tally live: every member's open Overview re-fetches its summary on receipt.
  notifyXenBudgetBookUpdate(bookId: string, memberIds: string[]) {
    this.emit(memberIds, "xenbudget:book_update", { bookId });
  }

  // Notify users that their books list has changed (e.g. added to a new book)
  notifyXenBudgetBooksUpdated(memberIds: string[]) {
    this.emit(memberIds, "xenbudget:books_updated");
  }

  // Tell people a note or notebook they can see changed, so their open board refreshes
  notifyXenNoteUpdate(userIds: string[]) {
    this.emit(userIds, "xennote:update");
  }
}
