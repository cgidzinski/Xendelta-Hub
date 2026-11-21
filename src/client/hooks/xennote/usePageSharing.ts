import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { SharedXenNoteGroup } from "../../types/XenNotePage";
import { useSocketInvalidate } from "../useSocketEvent";
import { xennoteKeys } from "./keys";

export function useSharedXenNoteItems() {
  const key = xennoteKeys.sharedItems();
  useSocketInvalidate("xennote:update", [key]);
  useSocketInvalidate("xennote:notebook_update", [key]);
  useSocketInvalidate("xennote:page_update", [key]);
  return useQuery({ queryKey: key, queryFn: () => api.get<SharedXenNoteGroup[]>("/api/xennote/shared-items") });
}

/** Record a successful open once per visit, even if a socket refreshes the view later. */
export function useMarkSharedNotebookSeen(id: string | undefined, through: string | undefined) {
  const client = useQueryClient();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!id || !through || last.current === id) return;
    last.current = id;
    void api.post(`/api/xennote/shared-items/notebook/${id}/seen`, { through }).then(
      () => client.invalidateQueries({ queryKey: xennoteKeys.sharedItems() }),
      () => {
        if (last.current === id) last.current = undefined;
      },
    );
  }, [client, id, through]);
}
