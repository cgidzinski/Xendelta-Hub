import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type {
  NoteFilters,
  PublicXenNote,
  XenNote,
  XenNoteCounts,
  XenNoteInput,
  XenNotebook,
} from "../../types/XenNote";
import { useSocketInvalidate } from "../useSocketEvent";
import { xennoteKeys } from "./keys";

// ---------- reading ----------

/** The notes matching `filters`, kept live: another member's change refetches the open board. */
export const useXenNotes = (filters: NoteFilters = {}) => {
  useSocketInvalidate("xennote:update", [xennoteKeys.all]);
  return useQuery({
    queryKey: xennoteKeys.notes(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.notebook) params.set("notebook", filters.notebook);
      if (filters.archived) params.set("archived", "true");
      if (filters.label) params.set("label", filters.label);
      if (filters.q?.trim()) params.set("q", filters.q.trim());
      const qs = params.toString();
      return (await api.get<{ notes: XenNote[] }>(`/api/xennote/notes${qs ? `?${qs}` : ""}`)).notes;
    },
    placeholderData: (previous) => previous,
  });
};

export const useXenNotebooks = () =>
  useQuery({
    queryKey: xennoteKeys.notebooks(),
    queryFn: async () => (await api.get<{ notebooks: XenNotebook[] }>("/api/xennote/notebooks")).notebooks,
  });

export const useXenNoteCounts = () =>
  useQuery({
    queryKey: xennoteKeys.counts(),
    queryFn: () => api.get<XenNoteCounts>("/api/xennote/counts"),
  });

export const useXenNoteLabels = () =>
  useQuery({
    queryKey: xennoteKeys.labels(),
    queryFn: async () =>
      (await api.get<{ labels: Array<{ name: string; count: number }> }>("/api/xennote/labels")).labels,
  });

export const usePublicNote = (token: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.publicNote(token ?? ""),
    queryFn: async () => (await api.get<{ note: PublicXenNote }>(`/api/xennote/public/note/${token}`)).note,
    enabled: !!token,
    retry: false,
  });

export const usePublicNotebook = (token: string | undefined) =>
  useQuery({
    queryKey: xennoteKeys.publicNotebook(token ?? ""),
    queryFn: () =>
      api.get<{ notebook: { name: string; color: string }; notes: PublicXenNote[] }>(
        `/api/xennote/public/notebook/${token}`,
      ),
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
  const deleteNote = useMutation({
    mutationFn: (id: string) => api.delete(`/api/xennote/notes/${id}`),
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
    addImages,
    removeImage,
    shareNote,
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
