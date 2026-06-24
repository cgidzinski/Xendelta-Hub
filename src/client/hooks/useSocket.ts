// The socket is now a single shared connection provided by SocketProvider.
// This module re-exports the context hook/types so existing import paths keep working.
export {
  useSocket,
  type SocketMessageNew,
  type SocketConversationNew,
  type SocketMessageDeleted,
  type SocketConversationUpdate,
} from "../contexts/SocketContext";
