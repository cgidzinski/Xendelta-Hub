import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import type { JSONContent } from "@tiptap/core";
import type { NoteColor } from "@shared/xennote/notes";
import { api, apiClient } from "../../config/api";
import type {
  NotebookTree,
  PageBodySaved,
  UploadedPageFile,
  XenNotePageDetail,
  XenNoteSection,
} from "../../types/XenNotePage";
import { liveQuery } from "../liveQuery";
import { useSocketInvalidate } from "../useSocketEvent";
import { xennoteKeys } from "./keys";

// Notebook sections and pages. Every key comes from xennoteKeys, so the existing "refetch everything" paths still work.

type Position = { before?: string; after?: string };

/** A notebook's sections and pages (no bodies), kept live: someone else's change refetches the open notebook. */
export const useNotebookTree = (notebookId: string | undefined) => {
  const forThis = (d: { notebookId: string }) => d.notebookId === notebookId;
  const keys = [xennoteKeys.tree(notebookId ?? "")];
  useSocketInvalidate("xennote:notebook_update", keys, forThis);
  // A saved page changes its excerpt, tags and to-do counts in the tree.
  useSocketInvalidate("xennote:page_update", keys, forThis);
  return useQuery({
    queryKey: xennoteKeys.tree(notebookId ?? ""),
    queryFn: () => api.get<NotebookTree>(`/api/xennote/notebooks/${notebookId}/tree`),
    enabled: !!notebookId,
    ...liveQuery,
  });
};

/**
 * One page with its text. It is not refetched on its own while open: the editor holds what is being typed, and a change
 * from someone else is offered to it (usePageDraft) rather than replacing it.
 */
export const useXenNotePage = (pageId: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.page(pageId ?? ""),
    queryFn: () => api.get<XenNotePageDetail>(`/api/xennote/pages/${pageId}`),
    enabled: !!pageId,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    // Never serve a copy kept from an earlier visit: the editor starts from this and saves against its revision.
    gcTime: 0,
  });

/** Save a page's text. `baseRev` is the revision the editor started from; `clientId` names this editor in the realtime event. */
export const savePageBody = (pageId: string, doc: JSONContent, baseRev: number, clientId?: string) =>
  api.put<PageBodySaved>(`/api/xennote/pages/${pageId}/body`, { doc, base_rev: baseRev, client_id: clientId });

/** Upload files to a page (pictures are resized by the server). Resolves with each file and a link to it. */
export async function uploadPageFiles(
  pageId: string,
  files: File[],
  onUploadProgress?: (event: AxiosProgressEvent) => void,
): Promise<UploadedPageFile[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await apiClient.post<{ data: { files: UploadedPageFile[] } }>(
    `/api/xennote/pages/${pageId}/files`,
    form,
    {
      onUploadProgress,
    },
  );
  return res.data.data.files;
}

/** Everything that changes a notebook's sections and pages. Each one refetches the notebook's tree afterwards. */
export const useNotebookPageActions = (notebookId: string) => {
  const queryClient = useQueryClient();
  const refreshTree = () => queryClient.invalidateQueries({ queryKey: xennoteKeys.tree(notebookId) });
  const refreshPage = (id: string) => queryClient.invalidateQueries({ queryKey: xennoteKeys.page(id) });
  return {
    createSection: useMutation({
      mutationFn: (v: { name: string; color?: NoteColor } & Position) =>
        api.post<{ section: XenNoteSection }>(`/api/xennote/notebooks/${notebookId}/sections`, v),
      onSuccess: refreshTree,
    }),
    updateSection: useMutation({
      mutationFn: (v: { id: string; name?: string; color?: NoteColor }) => {
        const { id, ...input } = v;
        return api.put<{ section: XenNoteSection }>(`/api/xennote/sections/${id}`, input);
      },
      onSuccess: refreshTree,
    }),
    moveSection: useMutation({
      mutationFn: (v: { id: string } & Position) => {
        const { id, ...position } = v;
        return api.post(`/api/xennote/sections/${id}/move`, position);
      },
      onSuccess: refreshTree,
    }),
    deleteSection: useMutation({
      mutationFn: (id: string) => api.delete(`/api/xennote/sections/${id}`),
      onSuccess: refreshTree,
    }),
    restoreSection: useMutation({
      mutationFn: (id: string) => api.post(`/api/xennote/sections/${id}/restore`),
      onSuccess: refreshTree,
    }),
    createPage: useMutation({
      mutationFn: (v: { sectionId: string; title?: string; parent_id?: string | null } & Position) => {
        const { sectionId, ...input } = v;
        return api.post<XenNotePageDetail>(`/api/xennote/sections/${sectionId}/pages`, input);
      },
      onSuccess: refreshTree,
    }),
    updatePage: useMutation({
      mutationFn: (v: {
        id: string;
        title?: string;
        icon?: string | null;
        color?: NoteColor;
        archived?: boolean;
        tags_manual?: string[];
        aliases?: string[];
      }) => {
        const { id, ...input } = v;
        return api.put<XenNotePageDetail>(`/api/xennote/pages/${id}`, input);
      },
      onSuccess: (_data, v) => {
        refreshTree();
        refreshPage(v.id);
      },
    }),
    movePage: useMutation({
      mutationFn: (v: { id: string; section_id?: string; parent_id?: string | null } & Position) => {
        const { id, ...input } = v;
        return api.post<XenNotePageDetail>(`/api/xennote/pages/${id}/move`, input);
      },
      onSuccess: (_data, v) => {
        refreshTree();
        refreshPage(v.id);
      },
    }),
    favoritePage: useMutation({
      mutationFn: (v: { id: string; favorite: boolean }) =>
        api.post<XenNotePageDetail>(`/api/xennote/pages/${v.id}/favorite`, { favorite: v.favorite }),
      onSuccess: (_data, v) => {
        refreshTree();
        refreshPage(v.id);
      },
    }),
    deletePage: useMutation({
      mutationFn: (id: string) => api.delete(`/api/xennote/pages/${id}`),
      onSuccess: refreshTree,
    }),
    restorePage: useMutation({
      mutationFn: (id: string) => api.post(`/api/xennote/pages/${id}/restore`),
      onSuccess: refreshTree,
    }),
  };
};
