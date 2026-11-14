import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "../config/tokenStore";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { resyncLiveQueries } from "../hooks/useLiveResync";
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
  const queryClient = useQueryClient();
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
      // Keep trying forever. Giving up after five attempts (about thirteen seconds) left the tab with no realtime
      // at all — silently — after a phone slept or a laptop was closed, until the page was reloaded.
      reconnectionAttempts: Infinity,
    });

    // Everything the server sends while this tab is away is dropped: nothing is queued for later. So after a
    // reconnect the open screens re-read whatever they missed.
    let missedEvents = false;
    newSocket.on("connect", () => {
      setIsConnected(true);
      if (missedEvents) {
        missedEvents = false;
        resyncLiveQueries(queryClient);
      }
    });

    newSocket.on("disconnect", () => {
      missedEvents = true;
      setIsConnected(false);
    });

    newSocket.on("connect_error", () => {
      setIsConnected(false);
    });

    // A re-issued token (after a 401, a refresh, or a sign-in in another tab) has to reach the handshake, or the
    // next reconnect presents a token the server may have already expired.
    const unsubscribeToken = tokenStore.subscribe((next) => {
      if (!next) return; // signed out: the effect above tears the socket down
      newSocket.auth = { token: next };
      if (!newSocket.connected) newSocket.connect();
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      unsubscribeToken();
      // Only disconnect if this is still the current socket
      if (socketRef.current === newSocket) {
        newSocket.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
    };
  }, [isAuthenticated, queryClient]);

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
