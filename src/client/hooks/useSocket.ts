// The socket is a single shared connection provided by SocketProvider.
// This module re-exports the context hook so existing import paths keep working.
export { useSocket } from "../contexts/SocketContext";
