import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import type { JSONContent } from "@tiptap/core";
import type { NoteColor } from "@shared/xennote/notes";
import { api, apiClient } from "../../config/api";
import type {
  Backlink,
  NotebookTree,
  PageHit,
  PagePeek,
  PageBodySaved,
  UnlinkedMention,
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

// ---- links between pages

type Waiting = { resolve: (peek: PagePeek) => void; reject: (e: unknown) => void };
let queue = new Map<string, Waiting[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Ask what a link should show. Calls made within a moment of each other go out as one request. */
export function peekPage(id: string): Promise<PagePeek> {
  return new Promise((resolve, reject) => {
    queue.set(id, [...(queue.get(id) ?? []), { resolve, reject }]);
    timer ??= setTimeout(async () => {
      const batch = queue;
      queue = new Map();
      timer = null;
      try {
        const res = await api.post<{ pages: PagePeek[] }>("/api/xennote/pages/peek", { ids: [...batch.keys()] });
        for (const peek of res.pages) batch.get(peek.id)?.forEach((w) => w.resolve(peek));
      } catch (e) {
        for (const waiting of batch.values()) waiting.forEach((w) => w.reject(e));
      }
    }, 20);
  });
}

/** What a link to this page shows: its current name, or that it is locked. Not asked for a link to no page yet. */
export const usePagePeek = (pageId: string | null | undefined) =>
  useQuery({
    queryKey: xennoteKeys.peek(pageId ?? ""),
    queryFn: () => peekPage(pageId as string),
    enabled: !!pageId,
    staleTime: 30_000,
  });

/** The pages to offer while someone types "[[": by name, the open notebook's first. */
export const suggestPages = async (q: string, notebookId?: string): Promise<PageHit[]> =>
  (
    await api.get<{ pages: PageHit[] }>("/api/xennote/pages/suggest", {
      params: { q, ...(notebookId ? { notebook: notebookId } : {}) },
    })
  ).pages;

/** The pages that link to this one (or wrote its title before it existed). */
export const usePageBacklinks = (pageId: string | undefined) => {
  useSocketInvalidate("xennote:page_update", [xennoteKeys.pageBacklinks(pageId ?? "")]);
  return useQuery({
    queryKey: xennoteKeys.pageBacklinks(pageId ?? ""),
    queryFn: async () => (await api.get<{ pages: Backlink[] }>(`/api/xennote/pages/${pageId}/backlinks`)).pages,
    enabled: !!pageId,
    ...liveQuery,
  });
};

/** Pages in this notebook that name this one in plain text without linking to it. */
export const usePageUnlinked = (pageId: string | undefined) => {
  useSocketInvalidate("xennote:page_update", [xennoteKeys.pageUnlinked(pageId ?? "")]);
  return useQuery({
    queryKey: xennoteKeys.pageUnlinked(pageId ?? ""),
    queryFn: async () => (await api.get<{ pages: UnlinkedMention[] }>(`/api/xennote/pages/${pageId}/unlinked`)).pages,
    enabled: !!pageId,
    ...liveQuery,
  });
};

/** "Link it": turn the first plain mention of `targetId` in page `sourceId` into a link. */
export const useLinkMention = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { sourceId: string; targetId: string }) =>
      api.post<{ rev: number }>(`/api/xennote/pages/${v.sourceId}/link-mention`, { target_id: v.targetId }),
    onSuccess: (_data, v) => {
      for (const key of [
        xennoteKeys.pageUnlinked(v.targetId),
        xennoteKeys.pageBacklinks(v.targetId),
        xennoteKeys.page(v.sourceId),
      ]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
};

/** Search the notebooks: by name, then by what pages say; narrowed to one notebook or one tag. */
export const useNotebookSearch = (q: string, options: { notebook?: string; tag?: string } = {}) =>
  useQuery({
    queryKey: xennoteKeys.pageSearch(q, options.notebook, options.tag),
    queryFn: async () =>
      (
        await api.get<{ pages: PageHit[] }>("/api/xennote/search", {
          params: {
            q,
            ...(options.notebook ? { notebook: options.notebook } : {}),
            ...(options.tag ? { tag: options.tag } : {}),
          },
        })
      ).pages,
    enabled: q.trim().length > 0 || !!options.tag,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
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
        // A rename shows in every link to the page.
        queryClient.invalidateQueries({ queryKey: xennoteKeys.peekAll() });
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
