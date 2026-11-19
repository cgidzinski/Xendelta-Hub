import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UPLOAD_TIMEOUT_MS, api } from "../../config/api";
import { liveQuery } from "../liveQuery";
import type {
  BrowseResult,
  BrowseView,
  FileDetailResult,
  FolderStats,
  PublicFolderInfo,
  PublicFolderView,
  XenDriveFile,
  XenDriveFolder,
} from "../../types/XenDriveFile";
import { xendriveKeys } from "./keys";

// Chunk size constant (10MB)
const CHUNK_SIZE = 10 * 1024 * 1024;

// ---------- chunked upload ----------

export interface XenDriveUploaded {
  _id: string;
  name: string;
  folder_id: string | null;
  mimeType: string;
  size: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Set `cancelled` to stop an upload between chunks; the half-written file is removed. */
export interface UploadSignal {
  cancelled: boolean;
}

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled");
  }
}

/**
 * Upload one file in 10 MB chunks: initiate (checks quota and the folder), send each chunk, finalize.
 * Not a hook, so the upload queue can run it outside any component.
 */
export async function uploadOne(params: {
  file: File;
  folderId?: string | null;
  /** An app uploading for the person (a chat attachment): tagged with where it came from, kept out of My Drive. */
  source?: { app: string; ref: string };
  signal?: UploadSignal;
  onProgress?: (percent: number) => void;
}): Promise<XenDriveUploaded> {
  const { file, folderId, source, signal, onProgress } = params;
  const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  const { uploadId } = await api.post<{ uploadId: string }>("/api/xendrive/initiate", {
    filename: file.name,
    totalChunks: chunkCount,
    fileSize: Math.max(1, file.size),
    folderId: folderId ?? null,
    ...(source ? { source } : {}),
  });

  try {
    for (let i = 0; i < chunkCount; i++) {
      if (signal?.cancelled) throw new UploadCancelled();
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await api.post(
        "/api/xendrive/chunk",
        { uploadId, chunkIndex: i, chunkData: await blobToBase64(chunk) },
        { timeout: UPLOAD_TIMEOUT_MS },
      );
      onProgress?.(((i + 1) / chunkCount) * 100);
    }
    if (signal?.cancelled) throw new UploadCancelled();
    return await api.post<XenDriveUploaded>("/api/xendrive/finalize", { uploadId });
  } catch (error) {
    // Don't leave a half-written file behind
    api.delete(`/api/xendrive/uploads/${uploadId}`).catch(() => undefined);
    throw error;
  }
}

// ---------- reading ----------

interface BrowseOptions {
  view?: BrowseView;
}

/** One folder's contents, the shared or recent view, or search results across the whole drive. */
export const useXendriveBrowse = (folderId?: string | null, search?: string, options: BrowseOptions = {}) =>
  useQuery({
    queryKey: xendriveKeys.browse(folderId, search, options.view),
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      else if (options.view === "shared" || options.view === "recent") params.set("view", options.view);
      else if (folderId) params.set("folder", folderId);
      return api.get<BrowseResult>(`/api/xendrive/browse?${params.toString()}`);
    },
    retry: 1,
    retryDelay: 1000,
    placeholderData: (previous) => previous,
    ...liveQuery,
  });

export const useXendriveFile = (fileId: string | undefined) =>
  useQuery({
    queryKey: xendriveKeys.file(fileId),
    queryFn: () => api.get<FileDetailResult>(`/api/xendrive/files/${fileId}`),
    enabled: !!fileId,
    retry: false,
    ...liveQuery,
  });

/** The first ~256 KB of a text-like file, shown in the page instead of its icon. */
export const useXendriveFileText = (fileId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...xendriveKeys.file(fileId), "text"],
    queryFn: () => api.get<{ text: string; truncated: boolean }>(`/api/xendrive/files/${fileId}/text`),
    enabled: !!fileId && enabled,
    retry: false,
    ...liveQuery,
  });

/** The newest files, the totals, and how many things have a public link (the home card and the sidebar). */
export const useXendriveRecent = () =>
  useQuery({
    queryKey: xendriveKeys.recent(),
    queryFn: () =>
      api.get<{
        files: XenDriveFile[];
        fileCount: number;
        spaceUsed: number;
        sharedCount: number;
      }>("/api/xendrive/recent"),
    ...liveQuery,
  });

/** What deleting or sharing a folder involves. Only fetched while `folderId` is set. */
export const useXendriveFolderStats = (folderId: string | null) =>
  useQuery({
    queryKey: xendriveKeys.folderStats(folderId ?? ""),
    queryFn: () => api.get<FolderStats>(`/api/xendrive/folders/${folderId}/stats`),
    enabled: !!folderId,
    gcTime: 0,
    ...liveQuery,
  });

/** Whether a folder link wants a password (and its name), before anything is opened. */
export const usePublicFolderInfo = (token: string | undefined) =>
  useQuery({
    queryKey: xendriveKeys.publicFolderInfo(token ?? ""),
    queryFn: () => api.get<PublicFolderInfo>(`/api/xendrive/public/folder/${token}/info`),
    enabled: !!token,
    retry: false,
  });

/** What is in a shared folder. `password` is the folder link's, when it has one; `enabled` waits until it is known. */
export const usePublicFolder = (
  token: string | undefined,
  folderId?: string | null,
  password?: string,
  enabled = true,
) =>
  useQuery({
    queryKey: xendriveKeys.publicFolder(token ?? "", folderId, password),
    queryFn: () => {
      // The password goes in a header, not the address (history, logs and referrers would keep it).
      const qs = folderId ? `?folder=${encodeURIComponent(folderId)}` : "";
      return api.get<PublicFolderView>(`/api/xendrive/public/folder/${token}${qs}`, {
        headers: password ? { "X-Share-Password": password } : undefined,
      });
    },
    enabled: !!token && enabled,
    retry: false,
  });

/** What the shared-folder page needs to show one file in place. Only fetched while a file is open. */
export interface PublicFilePreview {
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string | null;
  posterUrl: string | null;
  text: { text: string; truncated: boolean } | null;
}

export const usePublicFilePreview = (token: string | undefined, fileId: string | undefined, password?: string) =>
  useQuery({
    queryKey: [...xendriveKeys.publicFolderInfo(token ?? ""), "preview", fileId, ...(password ? [password] : [])],
    queryFn: () =>
      api.get<PublicFilePreview>(`/api/xendrive/public/folder/${token}/files/${fileId}/preview`, {
        headers: password ? { "X-Share-Password": password } : undefined,
      }),
    enabled: !!token && !!fileId,
    retry: false,
    // The signed link inside lasts a few minutes; reopening the same file asks again rather than reusing a stale one.
    staleTime: 0,
    gcTime: 0,
  });

// ---------- changing ----------

export interface FileSettings {
  name?: string;
  password?: string | null;
  expiry?: string | null;
  shareEnabled?: boolean;
}

/** All the drive mutations. Each refreshes whatever is on screen and the usage in the profile. */
export const useXendriveActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: xendriveKeys.all });
    queryClient.invalidateQueries({ queryKey: ["userProfile"] });
  };

  const createFolder = useMutation({
    mutationFn: (v: { name: string; parentId?: string | null }) =>
      api.post<{ folder: XenDriveFolder }>("/api/xendrive/folders", { name: v.name, parentId: v.parentId ?? null }),
    onSuccess: refresh,
  });
  const renameFolder = useMutation({
    mutationFn: (v: { folderId: string; name: string }) =>
      api.put<{ folder: XenDriveFolder }>(`/api/xendrive/folders/${v.folderId}`, { name: v.name }),
    onSuccess: refresh,
  });
  const deleteFolder = useMutation({
    mutationFn: (folderId: string) => api.delete(`/api/xendrive/folders/${folderId}`),
    onSuccess: refresh,
  });
  const shareFolder = useMutation({
    mutationFn: (v: { folderId: string; action: "enable" | "rotate" | "disable" }) => {
      const base = `/api/xendrive/folders/${v.folderId}/share`;
      if (v.action === "disable") return api.delete<{ folder: XenDriveFolder }>(base);
      return api.post<{ folder: XenDriveFolder }>(v.action === "rotate" ? `${base}/rotate` : base);
    },
    onSuccess: refresh,
  });
  const updateFolderShare = useMutation({
    mutationFn: (v: { folderId: string; settings: { password?: string | null; expiry?: string | null } }) =>
      api.put<{ folder: XenDriveFolder }>(`/api/xendrive/folders/${v.folderId}/share/settings`, v.settings),
    onSuccess: refresh,
  });
  const moveItems = useMutation({
    mutationFn: (v: { fileIds: string[]; folderIds: string[]; targetFolderId: string | null }) =>
      api.post<{ files: number; folders: number }>("/api/xendrive/move", v),
    onSuccess: refresh,
  });
  const deleteFile = useMutation({
    mutationFn: (fileId: string) => api.delete(`/api/xendrive/files/${fileId}`),
    onSuccess: refresh,
  });
  const updateFileSettings = useMutation({
    mutationFn: (v: { fileId: string; settings: FileSettings }) =>
      api.put<{ name: string; shared: boolean; hasPassword: boolean; expiry: string | null; shareUrl: string }>(
        `/api/xendrive/files/${v.fileId}/settings`,
        v.settings,
      ),
    onSuccess: refresh,
  });
  const rotateFileLink = useMutation({
    mutationFn: (fileId: string) => api.post<{ file: XenDriveFile }>(`/api/xendrive/files/${fileId}/share/rotate`),
    onSuccess: refresh,
  });

  return {
    createFolder,
    renameFolder,
    deleteFolder,
    moveItems,
    shareFolder,
    updateFolderShare,
    deleteFile,
    updateFileSettings,
    rotateFileLink,
  };
};

/** Save a file to the computer under its real name. */
export async function downloadFile(fileId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/api/xendrive/files/${fileId}/url?download=1`);
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Open the original file at full size in a new tab (the page shows a smaller rendition for images). */
export async function openOriginalFile(fileId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/api/xendrive/files/${fileId}/url`);
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Where a shared link points, for copying. */
export const fileShareUrl = (token: string) => `${window.location.origin}/xendrive/${token}`;
export const folderShareUrl = (token: string) => `${window.location.origin}/xendrive/f/${token}`;
