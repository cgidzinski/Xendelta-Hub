import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type {
  NoteFilters,
  PublicXenNote,
  XenNote,
  XenNoteBacklink,
  XenNoteCounts,
  XenNoteSharing,
  TrashedXenNote,
  XenNoteInput,
  XenNoteVersionFull,
  XenNoteVersionSummary,
  XenNotebook,
} from "../../types/XenNote";
import type { PublicPage } from "../../types/XenNotePage";
import { useSocketInvalidate } from "../useSocketEvent";
import { liveQuery } from "../liveQuery";
import { xennoteKeys } from "./keys";

// ---------- reading ----------

/** The notes matching `filters`, kept live: another member's change refetches the open board. */
export const useXenNotes = (filters: NoteFilters = {}) => {
  useSocketInvalidate("xennote:update", [xennoteKeys.all]);
  return useQuery({
    queryKey: xennoteKeys.notes(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.scope) params.set("scope", filters.scope);
      if (filters.archived) params.set("archived", "true");
      if (filters.label) params.set("label", filters.label);
      if (filters.q?.trim()) params.set("q", filters.q.trim());
      const qs = params.toString();
      return (await api.get<{ notes: XenNote[] }>(`/api/xennote/notes${qs ? `?${qs}` : ""}`)).notes;
    },
    placeholderData: (previous) => previous,
    ...liveQuery,
  });
};

export const useXenNotebooks = () => {
  useSocketInvalidate("xennote:notebook_update", [xennoteKeys.notebooks()]);
  return useQuery({
    queryKey: xennoteKeys.notebooks(),
    queryFn: async () => (await api.get<{ notebooks: XenNotebook[] }>("/api/xennote/notebooks")).notebooks,
    ...liveQuery,
  });
};

export const useXenNoteCounts = () =>
  useQuery({
    queryKey: xennoteKeys.counts(),
    queryFn: () => api.get<XenNoteCounts>("/api/xennote/counts"),
    ...liveQuery,
  });

/** Who one note is open to (its owner, the people it is shared with, its link). Only fetched while `noteId` is set. */
export const useXenNoteSharing = (noteId: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.sharing(noteId ?? ""),
    queryFn: () => api.get<XenNoteSharing>(`/api/xennote/notes/${noteId}/sharing`),
    enabled: !!noteId,
    ...liveQuery,
  });

/** The earlier versions of a note, newest first. Only fetched while `noteId` is set. */
export const useXenNoteVersions = (noteId: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.versions(noteId ?? ""),
    queryFn: async () =>
      (await api.get<{ versions: XenNoteVersionSummary[] }>(`/api/xennote/notes/${noteId}/versions`)).versions,
    enabled: !!noteId,
    staleTime: 0,
  });

/** One earlier version in full. Only fetched while both ids are set. */
export const useXenNoteVersion = (noteId: string | undefined, versionId: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.version(noteId ?? "", versionId ?? ""),
    queryFn: async () =>
      (await api.get<{ version: XenNoteVersionFull }>(`/api/xennote/notes/${noteId}/versions/${versionId}`)).version,
    enabled: !!noteId && !!versionId,
  });

/** Put an earlier version back (what the note says now is kept as a version first). */
export const useRestoreXenNoteVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { noteId: string; versionId: string }) =>
      api.post(`/api/xennote/notes/${v.noteId}/versions/${v.versionId}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: xennoteKeys.all }),
  });
};

/** The notes this person deleted in the last 30 days. */
export const useXenNoteTrash = () =>
  useQuery({
    queryKey: xennoteKeys.trash(),
    queryFn: async () => (await api.get<{ notes: TrashedXenNote[] }>("/api/xennote/trash")).notes,
    ...liveQuery,
  });

/** Bring a note back from the Trash, delete one for good, or empty the Trash. */
export const useXenNoteTrashActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: xennoteKeys.all });
  return {
    restore: useMutation({
      mutationFn: (id: string) => api.post(`/api/xennote/trash/${id}/restore`),
      onSuccess: refresh,
    }),
    deleteForever: useMutation({
      mutationFn: (id: string) => api.delete(`/api/xennote/trash/${id}`),
      onSuccess: refresh,
    }),
    empty: useMutation({
      mutationFn: () => api.delete<{ removed: number }>("/api/xennote/trash"),
      onSuccess: refresh,
    }),
  };
};

export const useXenNoteLabels = () =>
  useQuery({
    queryKey: xennoteKeys.labels(),
    queryFn: async () =>
      (await api.get<{ labels: Array<{ name: string; count: number }> }>("/api/xennote/labels")).labels,
    ...liveQuery,
  });

/** The notes that link to this one with [[its title]]. Only fetched while `noteId` is set. */
export const useXenNoteBacklinks = (noteId: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.backlinks(noteId ?? ""),
    queryFn: async () => (await api.get<{ notes: XenNoteBacklink[] }>(`/api/xennote/notes/${noteId}/backlinks`)).notes,
    enabled: !!noteId,
  });

export const useXenNoteMentions = (noteId: string) =>
  useQuery({
    queryKey: xennoteKeys.noteMentions(noteId),
    queryFn: async () =>
      (
        await api.get<{
          notes: Array<{ _id: string; title: string; snippet: string; can_link: boolean }>;
        }>(`/api/xennote/notes/${noteId}/mentions`)
      ).notes,
  });

export const useLinkXenNoteMention = (noteId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => api.post(`/api/xennote/notes/${noteId}/mentions/${sourceId}/link`),
    onSuccess: () => client.invalidateQueries({ queryKey: xennoteKeys.all }),
  });
};

export const usePublicNote = (token: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.publicNote(token ?? ""),
    queryFn: async () => (await api.get<{ note: PublicXenNote }>(`/api/xennote/public/note/${token}`)).note,
    enabled: !!token,
    retry: false,
  });

/** What a signed-in person opening a public link already has: a member goes to the real page, anyone else reads it. */
export interface SharedLinkAccess {
  access: "member" | "link";
  role: "owner" | "editor" | "viewer" | null;
  note_id?: string;
  page_id?: string;
  notebook_id: string | null;
}

export const useSharedLinkAccess = (kind: "note" | "notebook" | "page", token: string | undefined, signedIn: boolean) =>
  useQuery({
    queryKey: xennoteKeys.sharedLink(kind, token ?? ""),
    queryFn: () => api.get<SharedLinkAccess>(`/api/xennote/shared/${kind}/${token}`),
    enabled: !!token && signedIn,
    retry: false,
  });

export interface PublicNotebook {
  notebook: { name: string; color: string };
  sections: Array<{ id: string; name: string }>;
  pages: Array<{ id: string; title: string; section_id: string; parent_id: string | null }>;
}

export const usePublicPage = (token: string | undefined, pageId?: string) =>
  useQuery({
    queryKey: xennoteKeys.publicPage(token ?? "", pageId),
    queryFn: () =>
      api.get<PublicPage>(
        pageId ? `/api/xennote/public/notebook/${token}/pages/${pageId}` : `/api/xennote/public/page/${token}`,
      ),
    enabled: !!token,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });

export const usePublicNotebook = (token: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.publicNotebook(token ?? ""),
    queryFn: () => api.get<PublicNotebook>(`/api/xennote/public/notebook/${token}`),
    enabled: !!token,
    retry: false,
  });

// ---------- changing ----------

type ShareAction = "enable" | "rotate" | "disable";

/** Every mutation, each of which refreshes whatever is on screen. */
export const useXenNoteActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: xennoteKeys.all });

  const createNote = useMutation({
    mutationFn: async (input: XenNoteInput) => (await api.post<{ note: XenNote }>("/api/xennote/notes", input)).note,
    onSuccess: refresh,
  });
  const updateNote = useMutation({
    mutationFn: async (v: { id: string; input: XenNoteInput }) =>
      (await api.put<{ note: XenNote }>(`/api/xennote/notes/${v.id}`, v.input)).note,
    onSuccess: refresh,
  });
  // A personal reminder: an ISO time, or null to remove it. Changes nothing about the note itself.
  const setReminder = useMutation({
    mutationFn: async (v: { id: string; at: string | null }) =>
      (await api.put<{ note: XenNote }>(`/api/xennote/notes/${v.id}/reminder`, { at: v.at })).note,
    onSuccess: refresh,
  });
  // Deleting must not wait on the shared refresh: that refetches the open note's backlinks, which are now a 404 and
  // retry for several seconds, so the editor sat on a hung promise and never closed.
  const deleteNote = useMutation({
    mutationFn: (id: string) => api.delete(`/api/xennote/notes/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: xennoteKeys.backlinks(id) });
      void refresh();
    },
  });
  // Several notes at once: archive, colour, label or move them, or send them to the Trash.
  const bulkUpdateNotes = useMutation({
    mutationFn: (v: { ids: string[]; archived?: boolean; color?: string; add_label?: string }) =>
      api.post<{ updated: number; skipped: number }>("/api/xennote/notes/bulk-update", v),
    onSuccess: refresh,
  });
  const bulkDeleteNotes = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ deleted: number; skipped: number }>("/api/xennote/notes/bulk-delete", { ids }),
    onSuccess: refresh,
  });
  const addImages = useMutation({
    mutationFn: async (v: { id: string; files: File[] }) => {
      const form = new FormData();
      v.files.forEach((f) => form.append("images", f));
      return (await api.post<{ note: XenNote }>(`/api/xennote/notes/${v.id}/images`, form)).note;
    },
    onSuccess: refresh,
  });
  const removeImage = useMutation({
    mutationFn: async (v: { id: string; imageId: string }) =>
      (await api.delete<{ note: XenNote }>(`/api/xennote/notes/${v.id}/images/${v.imageId}`)).note,
    onSuccess: refresh,
  });
  const shareNote = useMutation({
    mutationFn: async (v: { id: string; action: ShareAction }) => {
      const base = `/api/xennote/notes/${v.id}/share`;
      const r =
        v.action === "disable"
          ? await api.delete<{ note: XenNote }>(base)
          : await api.post<{ note: XenNote }>(v.action === "rotate" ? `${base}/rotate` : base);
      return r.note;
    },
    onSuccess: refresh,
  });

  const addNoteMembers = useMutation({
    mutationFn: (v: { id: string; userIds: string[]; role: "editor" | "viewer" }) =>
      api.post<XenNoteSharing>(`/api/xennote/notes/${v.id}/members`, { userIds: v.userIds, role: v.role }),
    onSuccess: refresh,
  });
  const setNoteMemberRole = useMutation({
    mutationFn: (v: { id: string; userId: string; role: "editor" | "viewer" }) =>
      api.put<XenNoteSharing>(`/api/xennote/notes/${v.id}/members/${v.userId}`, { role: v.role }),
    onSuccess: refresh,
  });
  const removeNoteMember = useMutation({
    mutationFn: (v: { id: string; userId: string }) => api.delete(`/api/xennote/notes/${v.id}/members/${v.userId}`),
    onSuccess: refresh,
  });

  const createNotebook = useMutation({
    mutationFn: async (v: { name: string; color?: string }) =>
      (await api.post<{ notebook: XenNotebook }>("/api/xennote/notebooks", v)).notebook,
    onSuccess: refresh,
  });
  const updateNotebook = useMutation({
    mutationFn: async (v: { id: string; name?: string; color?: string }) =>
      (
        await api.put<{ notebook: XenNotebook }>(`/api/xennote/notebooks/${v.id}`, {
          name: v.name,
          color: v.color,
        })
      ).notebook,
    onSuccess: refresh,
  });
  const deleteNotebook = useMutation({
    mutationFn: (id: string) => api.delete(`/api/xennote/notebooks/${id}`),
    onSuccess: refresh,
  });
  const addMembers = useMutation({
    mutationFn: async (v: { id: string; userIds: string[]; role: "editor" | "viewer" }) =>
      (
        await api.post<{ notebook: XenNotebook }>(`/api/xennote/notebooks/${v.id}/members`, {
          userIds: v.userIds,
          role: v.role,
        })
      ).notebook,
    onSuccess: refresh,
  });
  const setRole = useMutation({
    mutationFn: async (v: { id: string; userId: string; role: "owner" | "editor" | "viewer" }) =>
      (
        await api.put<{ notebook: XenNotebook }>(`/api/xennote/notebooks/${v.id}/members/${v.userId}`, {
          role: v.role,
        })
      ).notebook,
    onSuccess: refresh,
  });
  const removeMember = useMutation({
    mutationFn: (v: { id: string; userId: string }) => api.delete(`/api/xennote/notebooks/${v.id}/members/${v.userId}`),
    onSuccess: refresh,
  });
  const shareNotebook = useMutation({
    mutationFn: async (v: { id: string; action: ShareAction }) => {
      const base = `/api/xennote/notebooks/${v.id}/share`;
      const r =
        v.action === "disable"
          ? await api.delete<{ notebook: XenNotebook }>(base)
          : await api.post<{ notebook: XenNotebook }>(v.action === "rotate" ? `${base}/rotate` : base);
      return r.notebook;
    },
    onSuccess: refresh,
  });

  return {
    createNote,
    updateNote,
    setReminder,
    deleteNote,
    bulkUpdateNotes,
    bulkDeleteNotes,
    addImages,
    removeImage,
    shareNote,
    addNoteMembers,
    setNoteMemberRole,
    removeNoteMember,
    createNotebook,
    updateNotebook,
    deleteNotebook,
    addMembers,
    setRole,
    removeMember,
    shareNotebook,
  };
};

export const noteShareUrl = (token: string) => `${window.location.origin}/n/${token}`;
export const notebookShareUrl = (token: string) => `${window.location.origin}/n/b/${token}`;
