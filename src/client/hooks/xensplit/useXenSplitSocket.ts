import { useSocketInvalidate } from "../useSocketEvent";

export function useXenSplitSocket(groupId: string) {
  useSocketInvalidate<{ groupId: string }>(
    "xensplit:group_update",
    [
      ["xensplit", "group", groupId],
      ["xensplit", "balances", groupId],
    ],
    (data) => data.groupId === groupId,
  );
}

export function useXenSplitGroupsSocket() {
  useSocketInvalidate("xensplit:groups_updated", [["xensplit", "groups"]]);
}
