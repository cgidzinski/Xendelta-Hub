import { useChatRealtime } from "./chat/useChatRealtime";
import { useCommunityRealtime } from "./communities/useCommunityRealtime";
import { useRealtime } from "./useRealtime";

interface UseNavBarSocketOptions {
  onNewNotification?: () => void;
}

/**
 * The live updates the signed-in shell always needs: new notifications (the bell), chat (unread badges and the
 * open conversation's cache, through useChatRealtime) and communities (their channels and invites).
 */
export function useNavBarSocket(options: UseNavBarSocketOptions = {}) {
  const { onNewNotification } = options;
  useChatRealtime();
  useCommunityRealtime();
  useRealtime("notification:new", () => onNewNotification?.());
}
