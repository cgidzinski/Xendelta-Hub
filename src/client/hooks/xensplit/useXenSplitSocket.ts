import { xensplitKeys } from "./keys";
import { useSocketInvalidate } from "../useSocketEvent";

export function useXenSplitSocket(groupId: string) {
  useSocketInvalidate<{ groupId: string }>(
    "xensplit:group_update",
    [xensplitKeys.group(groupId), xensplitKeys.balances(groupId)],
    (data) => data.groupId === groupId,
  );
}

export function useXenSplitGroupsSocket() {
  useSocketInvalidate("xensplit:groups_updated", [xensplitKeys.groups()]);
}
