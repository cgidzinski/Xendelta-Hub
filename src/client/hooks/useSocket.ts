import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

export const useSocket = (): UseSocketReturn => {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    // Disconnect existing socket if any (prevent duplicates during hot reload)
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Initialize socket connection
    const socket = io(window.location.origin, {
      auth: {
        token: token,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      console.log("Socket connected");
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setIsConnected(false);
      // Only clear ref if it's the current socket
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setIsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      // Only disconnect if this is still the current socket
      if (socketRef.current === socket) {
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [isAuthenticated]);

  const joinConversation = (conversationId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("join:conversation", conversationId);
    }
  };

  const leaveConversation = (conversationId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("leave:conversation", conversationId);
    }
  };

  const startTyping = (conversationId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("typing:start", { conversationId });
    }
  };

  const stopTyping = (conversationId: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("typing:stop", { conversationId });
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    joinConversation,
    leaveConversation,
    startTyping,
    stopTyping,
  };
};

// Export socket event types for use in components
export interface SocketMessageNew {
  conversationId: string;
  message: {
    _id: string;
    from: string;
    message: string;
    time: string;
    unread: boolean;
    parentMessageId?: string;
    isSystemMessage?: boolean;
    senderUsername?: string;
  };
}

export interface SocketConversationNew {
  conversation: {
    _id: string;
    participants: string[];
    lastMessage: string;
    lastMessageTime: string;
    unread: boolean;
    updatedAt: string;
  };
}

export interface SocketMessageDeleted {
  conversationId: string;
  messageId: string;
}

export interface SocketConversationUpdate {
  conversationId: string;
  update: any;
}

