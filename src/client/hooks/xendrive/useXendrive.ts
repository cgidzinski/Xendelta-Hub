import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UPLOAD_TIMEOUT_MS, api } from "../../config/api";
import type {
  BrowseResult,
  FolderStats,
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

function sliceFile(file: File, chunkSize: number): Blob[] {
  const chunks: Blob[] = [];
  for (let offset = 0; offset < file.size; offset += chunkSize) chunks.push(file.slice(offset, offset + chunkSize));
  return chunks;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface UploadFileParams {
  file: File;
  /** The folder to upload into; omit for the top level. */
  folderId?: string | null;
  onProgress?: (percent: number) => void;
}

/** Upload one file in 10 MB chunks: initiate (checks quota), send each chunk, finalize. */
export const useXendriveUpload = () => {
  const queryClient = useQueryClient();

  const { mutateAsync: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: async ({ file, folderId, onProgress }: UploadFileParams): Promise<XenDriveUploaded> => {
      const chunks = sliceFile(file, CHUNK_SIZE);
      const totalChunks = Math.max(1, chunks.length);

      const { uploadId } = await api.post<{ uploadId: string }>("/api/xendrive/initiate", {
        filename: file.name,
        totalChunks,
        fileSize: file.size,
        folderId: folderId ?? null,
      });

      try {
        for (let i = 0; i < chunks.length; i++) {
          await api.post(
            "/api/xendrive/chunk",
            { uploadId, chunkIndex: i, chunkData: await blobToBase64(chunks[i]) },
            { timeout: UPLOAD_TIMEOUT_MS },
          );
          onProgress?.(((i + 1) / totalChunks) * 100);
        }
        return await api.post<XenDriveUploaded>("/api/xendrive/finalize", { uploadId });
      } catch (error) {
        // Don't leave a half-written file behind
        api.delete(`/api/xendrive/uploads/${uploadId}`).catch(() => undefined);
        throw error;
      } finally {
        queryClient.invalidateQueries({ queryKey: xendriveKeys.all });
        queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      }
    },
  });

  return { uploadFile, isUploading };
};

// ---------- reading ----------

/** One folder's contents, or search results across the whole drive. */
export const useXendriveBrowse = (folderId?: string | null, search?: string) =>
  useQuery({
    queryKey: xendriveKeys.browse(folderId, search),
    queryFn: () => {
      const params = new URLSearchParams();
      if (folderId) params.set("folder", folderId);
      if (search) params.set("search", search);
      return api.get<BrowseResult>(`/api/xendrive/browse?${params.toString()}`);
    },
    retry: 1,
    retryDelay: 1000,
    placeholderData: (previous) => previous,
  });

export const useXendriveFile = (fileId: string | undefined) =>
  useQuery({
    queryKey: xendriveKeys.file(fileId),
    queryFn: () =>
      api.get<{ file: XenDriveFile; breadcrumb: Array<{ _id: string; name: string }> }>(
        `/api/xendrive/files/${fileId}`,
      ),
    enabled: !!fileId,
    retry: false,
  });

export const useXendriveRecent = () =>
  useQuery({
    queryKey: xendriveKeys.recent(),
    queryFn: () => api.get<{ files: XenDriveFile[]; fileCount: number; spaceUsed: number }>("/api/xendrive/recent"),
  });

/** What deleting a folder would remove. Only fetched while the confirmation is open. */
export const useXendriveFolderStats = (folderId: string | null) =>
  useQuery({
    queryKey: xendriveKeys.folderStats(folderId ?? ""),
    queryFn: () => api.get<FolderStats>(`/api/xendrive/folders/${folderId}/stats`),
    enabled: !!folderId,
    gcTime: 0,
  });

export const usePublicFolder = (token: string | undefined, folderId?: string | null) =>
  useQuery({
    queryKey: xendriveKeys.publicFolder(token ?? "", folderId),
    queryFn: () =>
      api.get<PublicFolderView>(
        `/api/xendrive/public/folder/${token}${folderId ? `?folder=${encodeURIComponent(folderId)}` : ""}`,
      ),
    enabled: !!token,
    retry: false,
  });

// ---------- changing ----------

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
  const deleteFile = useMutation({
    mutationFn: (fileId: string) => api.delete(`/api/xendrive/files/${fileId}`),
    onSuccess: refresh,
  });
  const updateFileSettings = useMutation({
    mutationFn: (v: {
      fileId: string;
      settings: { password?: string | null; expiry?: string | null; name?: string };
    }) =>
      api.put<{ shareUrl: string; hasPassword: boolean; expiry: string | null; name: string }>(
        `/api/xendrive/files/${v.fileId}/settings`,
        v.settings,
      ),
    onSuccess: refresh,
  });

  return { createFolder, renameFolder, deleteFolder, shareFolder, deleteFile, updateFileSettings };
};

/** Where a shared link points, for copying. */
export const fileShareUrl = (token: string) => `${window.location.origin}/xendrive/${token}`;
export const folderShareUrl = (token: string) => `${window.location.origin}/xendrive/f/${token}`;
