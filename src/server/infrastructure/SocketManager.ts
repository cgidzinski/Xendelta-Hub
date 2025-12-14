import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
const { User } = require("../models/user");

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

export class SocketManager {
  private static instance: SocketManager;
  private io!: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId
  private isInitialized: boolean = false;

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-development') as any;
        const user = await User.findOne({ _id: decoded._id }).exec();
        
        if (!user) {
          return next(new Error("Authentication error: User not found"));
        }

        socket.userId = user._id.toString();
        socket.username = user.username;
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

      // Check if user already has an active connection
      const existingSocketId = this.connectedUsers.get(socket.userId);
      if (existingSocketId && existingSocketId !== socket.id) {
        // Disconnect the old socket if it still exists
        const existingSocket = this.io.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          console.log(`User ${socket.username} (${socket.userId}) reconnecting - disconnecting old socket`);
          existingSocket.disconnect();
        }
      }

      console.log(`User ${socket.username} (${socket.userId}) connected`);
      this.connectedUsers.set(socket.userId, socket.id);

      // Join user's personal room for direct notifications
      socket.join(`user:${socket.userId}`);

      // Emit online status to other users
      socket.broadcast.emit("user:online", {
        userId: socket.userId,
        username: socket.username,
      });

      // Join conversation rooms
      socket.on("join:conversation", async (conversationId: string) => {
        socket.join(`conversation:${conversationId}`);
        console.log(`User ${socket.userId} joined conversation ${conversationId}`);
      });

      // Leave conversation room
      socket.on("leave:conversation", (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`User ${socket.userId} left conversation ${conversationId}`);
      });

      // Typing indicator
      socket.on("typing:start", (data: { conversationId: string }) => {
        socket.to(`conversation:${data.conversationId}`).emit("typing:start", {
          userId: socket.userId,
          username: socket.username,
          conversationId: data.conversationId,
        });
      });

      socket.on("typing:stop", (data: { conversationId: string }) => {
        socket.to(`conversation:${data.conversationId}`).emit("typing:stop", {
          userId: socket.userId,
          username: socket.username,
          conversationId: data.conversationId,
        });
      });

      // Disconnection handler
      socket.on("disconnect", () => {
        // Only remove from map if this is the current active socket for this user
        const currentSocketId = this.connectedUsers.get(socket.userId!);
        if (currentSocketId === socket.id) {
          console.log(`User ${socket.username} (${socket.userId}) disconnected`);
          this.connectedUsers.delete(socket.userId!);
          
          // Emit offline status
          socket.broadcast.emit("user:offline", {
            userId: socket.userId,
            username: socket.username,
          });
        }
      });
    });
  }

  // Send new message to conversation participants
  sendNewMessage(conversationId: string, message: any, participants: string[]) {
    this.io.to(`conversation:${conversationId}`).emit("message:new", {
      conversationId,
      message,
    });

    // Also notify participants who aren't in the conversation room
    participants.forEach((participantId) => {
      if (participantId !== "system") {
        this.io.to(`user:${participantId}`).emit("message:new", {
          conversationId,
          message,
        });
      }
    });
  }

  // Notify user about new conversation
  notifyNewConversation(userId: string, conversation: any) {
    this.io.to(`user:${userId}`).emit("conversation:new", {
      conversation,
    });
  }

  // Notify conversation participants about message update
  notifyMessageUpdate(conversationId: string, messageId: string, update: any) {
    this.io.to(`conversation:${conversationId}`).emit("message:update", {
      conversationId,
      messageId,
      update,
    });
  }

  // Notify conversation participants about message deletion
  notifyMessageDeleted(conversationId: string, messageId: string) {
    this.io.to(`conversation:${conversationId}`).emit("message:deleted", {
      conversationId,
      messageId,
    });
  }

  // Notify participants about conversation update (e.g., new participant)
  notifyConversationUpdate(conversationId: string, update: any) {
    this.io.to(`conversation:${conversationId}`).emit("conversation:update", {
      conversationId,
      update,
    });
  }

  getIO() {
    return this.io;
  }

  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  getSocketId(userId: string): string | undefined {
    return this.connectedUsers.get(userId);
  }

  // Send new notification to specific user
  sendNotification(userId: string, notification: any) {
    this.io.to(`user:${userId}`).emit("notification:new", {
      notification,
    });
  }

  // Notify user about notification update (e.g., marked as read)
  notifyNotificationUpdate(userId: string, notificationId: string, update: any) {
    this.io.to(`user:${userId}`).emit("notification:update", {
      notificationId,
      update,
    });
  }
}
