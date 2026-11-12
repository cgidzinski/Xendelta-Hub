import { useChatRealtime } from "./chat/useChatRealtime";
import { useRealtime } from "./useRealtime";

interface UseNavBarSocketOptions {
  onNewNotification?: () => void;
}

/**
 * The live updates the signed-in shell always needs: new notifications (the bell) and chat (unread badges and the
 * open conversation's cache, through useChatRealtime).
 */
export function useNavBarSocket(options: UseNavBarSocketOptions = {}) {
  const { onNewNotification } = options;
  useChatRealtime();
  useRealtime("notification:new", () => onNewNotification?.());
}
