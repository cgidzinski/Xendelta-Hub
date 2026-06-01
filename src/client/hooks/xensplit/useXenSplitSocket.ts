import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../useSocket";

export function useXenSplitSocket(groupId: string) {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleGroupUpdate = (data: { groupId: string }) => {
      if (data.groupId === groupId) {
        queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
        queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
      }
    };

    socket.on("xensplit:group_update", handleGroupUpdate);
    return () => {
      socket.off("xensplit:group_update", handleGroupUpdate);
    };
  }, [socket, groupId, queryClient]);
}

export function useXenSplitGroupsSocket() {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleGroupsUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "groups"] });
    };

    socket.on("xensplit:groups_updated", handleGroupsUpdated);
    return () => {
      socket.off("xensplit:groups_updated", handleGroupsUpdated);
    };
  }, [socket, queryClient]);
}
