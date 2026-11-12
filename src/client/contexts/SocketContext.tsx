import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { tokenStore } from "../config/tokenStore";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import type { ClientEvents } from "@shared/realtime";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  /** Tell the other members you are (or have stopped) typing in a chat. */
  sendTyping: (conversationId: string, typing: boolean) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const token = tokenStore.get();
    if (!token) return;

    // Disconnect existing socket if any (prevent duplicates during hot reload)
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Initialize the single shared socket connection
    const newSocket = io(window.location.origin, {
      auth: {
        token: token,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on("connect", () => {
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });

    newSocket.on("connect_error", () => {
      setIsConnected(false);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      // Only disconnect if this is still the current socket
      if (socketRef.current === newSocket) {
        newSocket.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, [isAuthenticated]);

  const sendTyping = (conversationId: string, typing: boolean) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("chat:typing", { conversationId, typing } satisfies ClientEvents["chat:typing"]);
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    sendTyping,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
