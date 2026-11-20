import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { PagePeople, SharedXenNoteGroup } from "../../types/XenNotePage";
import { useSocketInvalidate } from "../useSocketEvent";
import { xennoteKeys } from "./keys";

type Role = "editor" | "viewer";
type ShareAction = "enable" | "rotate" | "disable";

export function usePagePeople(pageId: string | undefined) {
  const key = xennoteKeys.pagePeople(pageId ?? "");
  useSocketInvalidate("xennote:notebook_update", [key]);
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<PagePeople>(`/api/xennote/pages/${pageId}/people`),
    enabled: !!pageId,
  });
}

export function usePageSharingActions(pageId: string) {
  const client = useQueryClient();
  const people = `/api/xennote/pages/${pageId}/people`;
  const link = `/api/xennote/pages/${pageId}/share`;
  const update = (data: PagePeople | null) => {
    client.setQueryData(xennoteKeys.pagePeople(pageId), data);
    void client.invalidateQueries({ queryKey: xennoteKeys.sharedItems() });
    void client.invalidateQueries({ queryKey: xennoteKeys.page(pageId) });
  };
  const add = useMutation({
    mutationFn: (body: { userIds: string[]; role: Role }) => api.post<PagePeople>(people, body),
    onSuccess: update,
  });
  const change = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.put<PagePeople>(`${people}/${userId}`, { role }),
    onSuccess: update,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.delete<PagePeople | null>(`${people}/${userId}`),
    onSuccess: update,
  });
  const share = useMutation({
    mutationFn: (action: ShareAction) =>
      action === "disable"
        ? api.delete<PagePeople>(link)
        : api.post<PagePeople>(action === "rotate" ? `${link}/rotate` : link),
    onSuccess: update,
  });
  return { add, change, remove, share };
}

export function useSharedXenNoteItems() {
  const key = xennoteKeys.sharedItems();
  useSocketInvalidate("xennote:update", [key]);
  useSocketInvalidate("xennote:notebook_update", [key]);
  useSocketInvalidate("xennote:page_update", [key]);
  return useQuery({ queryKey: key, queryFn: () => api.get<SharedXenNoteGroup[]>("/api/xennote/shared-items") });
}

/** Record a successful open once per visit, even if a socket refreshes the view later. */
export function useMarkSharedSeen(kind: "notebook" | "page", id: string | undefined, through: string | undefined) {
  const client = useQueryClient();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!id || !through || last.current === id) return;
    last.current = id;
    void api.post(`/api/xennote/shared-items/${kind}/${id}/seen`, { through }).then(
      () => client.invalidateQueries({ queryKey: xennoteKeys.sharedItems() }),
      () => {
        if (last.current === id) last.current = undefined;
      },
    );
  }, [client, id, kind, through]);
}
